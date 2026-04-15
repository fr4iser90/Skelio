import type { Vec2 } from "../ik2d.js";
import { worldPoseBoneMatrices } from "../pose.js";
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

type PoseMatsCache = { project: EditorProject; time: number; mats: Map<string, { a: number; b: number; e: number; f: number }> };
let poseMatsCache: PoseMatsCache | null = null;

function poseMatsAtTimeCached(project: EditorProject, time: number) {
  const c = poseMatsCache;
  if (c && c.project === project && c.time === time) return c.mats;
  const mats = worldPoseBoneMatrices(project, time);
  poseMatsCache = { project, time, mats };
  return mats;
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
): { rootBoneId: string; midBoneId: string; rootLocalRot: number; midLocalRot: number } | null {
  const solved = solveTwoBoneChain2dAtTime(project, time, chainId);
  if (!solved) return null;
  const { root, mid } = solved;
  const mats = poseMatsAtTimeCached(project, time);
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
export function solveTwoBoneChain2dAtTime(project: EditorProject, time: number, chainId: string): SolvedTwoBoneChain2d | null {
  const chain = getTwoBoneChainById(project, chainId);
  if (!chain || !chain.enabled) return null;

  const root = project.bones.find((b) => b.id === chain.rootBoneId);
  const mid = project.bones.find((b) => b.id === chain.midBoneId);
  const tip = project.bones.find((b) => b.id === chain.tipBoneId);
  if (!root || !mid || !tip) return null;
  if (mid.parentId !== root.id) return null;
  if (tip.parentId !== mid.id) return null;

  const mats = poseMatsAtTimeCached(project, time);
  const Wr = mats.get(root.id);
  const Wm = mats.get(mid.id);
  if (!Wr || !Wm) return null;
  const p0: Vec2 = { x: Wr.e, y: Wr.f };
  const p1fk: Vec2 = { x: Wm.e, y: Wm.f };

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

  const lengths: [number, number] = [Math.max(root.length, 1e-6), Math.max(mid.length, 1e-6)];
  const solved = solveTwoBoneIk2d(p0, p1fk, lengths, target, { allowStretch: chain.allowStretch ?? false, pole });

  return { chain, root, mid, tip, p0, p1fk, target, pole, lengths, solved };
}

