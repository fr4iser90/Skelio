import { worldPoseBoneMatrices4 } from "../bone3dPose.js";
import { mat4ToMat2dProjection, planar2dClosedFkChainOpts } from "../bone2dPose.js";
import { segmentLengthsFromBindOrigins, type Vec2 } from "../ik2d.js";
import { transformPointMat4, type Mat4 } from "../mat4.js";
import { worldBindOrigins } from "../pose.js";
import type { Bone, EditorProject, IkTwoBoneChain } from "../types.js";
import { getTwoBoneIkChains } from "./accessors.js";
import { sampleIkTargetOverride2d } from "./controls.js";
import { solveTwoBoneIk2d } from "./ik2bone2d.js";

export type SolvedTwoBoneChain2d = {
  chain: IkTwoBoneChain;
  root: Bone;
  mid: Bone;
  tip: Bone;
  p0: Vec2;
  p1fk: Vec2;
  target: Vec2;
  pole?: Vec2;
  lengths: [number, number];
  solved: ReturnType<typeof solveTwoBoneIk2d>;
};

export function getTwoBoneChainById(project: EditorProject, chainId: string): IkTwoBoneChain | null {
  const ch = getTwoBoneIkChains(project).find((c) => c.id === chainId);
  return ch ?? null;
}

export type PoseMatsCache = {
  project: EditorProject;
  time: number;
  /** Matches {@link EvaluatePoseOptions.planar2dNoTiltSpin} for cache keying. */
  planar2dNoTiltSpin: boolean;
  /** FK world 4×4 — same basis as {@link evaluatePose} / rigid slices (ADR 0011). */
  fk4: Map<string, Mat4>;
  /** XY projection of `fk4` for 2D angle extraction (parent world heading). */
  mats2d: Map<string, { a: number; b: number; e: number; f: number }>;
};
let poseMatsCache: PoseMatsCache | null = null;

/** Shared FK 4×4 cache for IK solvers at the same `(project, time, planar flag)`. */
export function poseFkAtTimeCached(
  project: EditorProject,
  time: number,
  planar2dNoTiltSpin = false,
): PoseMatsCache {
  const c = poseMatsCache;
  if (c && c.project === project && c.time === time && c.planar2dNoTiltSpin === planar2dNoTiltSpin) return c;
  const fk4 = worldPoseBoneMatrices4(
    project,
    time,
    planar2dNoTiltSpin ? planar2dClosedFkChainOpts : undefined,
  );
  const mats2d = new Map<string, { a: number; b: number; e: number; f: number }>();
  for (const [id, m] of fk4) {
    const p2 = mat4ToMat2dProjection(m);
    mats2d.set(id, { a: p2.a, b: p2.b, e: p2.e, f: p2.f });
  }
  poseMatsCache = { project, time, planar2dNoTiltSpin, fk4, mats2d };
  return poseMatsCache;
}

function poseMatsAtTimeCached(project: EditorProject, time: number, planar2dNoTiltSpin = false) {
  return poseFkAtTimeCached(project, time, planar2dNoTiltSpin).mats2d;
}

function angleFromMat2d(m: { a: number; b: number }): number {
  return Math.atan2(m.b, m.a);
}

function unwrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Absolute local rotations (radians) for root and mid bones from the IK solve, matching bake semantics.
 */
export function twoBoneIkAbsoluteLocalRotsAtTime(
  project: EditorProject,
  time: number,
  chainId: string,
  planar2dNoTiltSpin = false,
): { rootBoneId: string; midBoneId: string; rootLocalRot: number; midLocalRot: number } | null {
  const solved = solveTwoBoneChain2dAtTime(project, time, chainId, planar2dNoTiltSpin);
  if (!solved) return null;
  const { root, mid } = solved;
  const mats = poseMatsAtTimeCached(project, time, planar2dNoTiltSpin);
  const Wp = root.parentId ? mats.get(root.parentId) : null;
  const parentWorld = Wp ? angleFromMat2d(Wp) : 0;
  const rootLocalRot = unwrapAngle(solved.solved.rootWorldAngle - parentWorld);
  const midLocalRot = unwrapAngle(solved.solved.midWorldAngle - solved.solved.rootWorldAngle);
  return { rootBoneId: root.id, midBoneId: mid.id, rootLocalRot, midLocalRot };
}

/**
 * Single source for 2-bone IK solve inputs:
 * - rig-first chain
 * - target/pole overrides from controls (animated)
 * - FK joint positions from world pose matrices at time
 */
export function solveTwoBoneChain2dAtTime(
  project: EditorProject,
  time: number,
  chainId: string,
  planar2dNoTiltSpin = false,
): SolvedTwoBoneChain2d | null {
  const chain = getTwoBoneChainById(project, chainId);
  if (!chain || !chain.enabled) return null;

  const root = project.bones.find((b) => b.id === chain.rootBoneId);
  const mid = project.bones.find((b) => b.id === chain.midBoneId);
  const tip = project.bones.find((b) => b.id === chain.tipBoneId);
  if (!root || !mid || !tip) return null;
  if (mid.parentId !== root.id) return null;
  if (tip.parentId !== mid.id) return null;

  const cache = poseFkAtTimeCached(project, time, planar2dNoTiltSpin);
  const Mr = cache.fk4.get(root.id);
  const Mm = cache.fk4.get(mid.id);
  if (!Mr || !Mm) return null;
  const j0 = transformPointMat4(Mr, 0, 0, 0);
  const j1 = transformPointMat4(Mm, 0, 0, 0);
  const p0: Vec2 = { x: j0.x, y: j0.y };
  const p1fk: Vec2 = { x: j1.x, y: j1.y };

  const ovr = sampleIkTargetOverride2d(project, chain.id, time);
  const target: Vec2 = { x: ovr?.x ?? chain.targetX, y: ovr?.y ?? chain.targetY };

  const poleFromCtl =
    ovr && typeof ovr.poleX === "number" && Number.isFinite(ovr.poleX) && typeof ovr.poleY === "number" && Number.isFinite(ovr.poleY)
      ? ({ x: ovr.poleX, y: ovr.poleY } satisfies Vec2)
      : undefined;
  const poleFromChain =
    typeof chain.poleX === "number" && Number.isFinite(chain.poleX) && typeof chain.poleY === "number" && Number.isFinite(chain.poleY)
      ? ({ x: chain.poleX, y: chain.poleY } satisfies Vec2)
      : undefined;
  const pole = poleFromCtl ?? poleFromChain;

  /** Use bind-pose joint spacing (root→mid, mid→tip), not `bone.length`, so IK matches the real chain. */
  const bo = worldBindOrigins(project);
  const oR = bo.get(root.id);
  const oM = bo.get(mid.id);
  const oT = bo.get(tip.id);
  if (!oR || !oM || !oT) return null;
  const [d01, d12] = segmentLengthsFromBindOrigins(oR, oM, oT);
  const lengths: [number, number] = [Math.max(d01, 1e-6), Math.max(d12, 1e-6)];
  const solved = solveTwoBoneIk2d(p0, p1fk, lengths, target, { allowStretch: chain.allowStretch ?? false, pole });

  return { chain, root, mid, tip, p0, p1fk, target, pole, lengths, solved };
}

