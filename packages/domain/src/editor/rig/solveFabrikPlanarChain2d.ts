import { getLocalBoneState, worldBindBoneMatrices4 } from "../bone3dPose.js";
import { fabrik2dChain, type Vec2 } from "../ik2d.js";
import { transformPointMat4 } from "../mat4.js";
import type { EditorProject } from "../types.js";
import { getFabrikIkChainById } from "./accessors.js";
import { activeClip, sampleIkTargetOverride2d } from "./controls.js";
import { poseFkAtTimeCached } from "./solveTwoBoneChain2d.js";

function angleFromMat2d(m: { a: number; b: number }): number {
  return Math.atan2(m.b, m.a);
}

function unwrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** `boneIds[0]` … `boneIds[n-1]` must be a strict parent line (each child of previous). */
export function validateFabrikBoneChain(project: EditorProject, boneIds: string[]): boolean {
  if (boneIds.length < 3) return false;
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  for (let i = 1; i < boneIds.length; i++) {
    const cur = byId.get(boneIds[i]!);
    if (!cur || cur.parentId !== boneIds[i - 1]) return false;
  }
  return true;
}

function bindWorldJointPoints(project: EditorProject, boneIds: string[]): Vec2[] | null {
  const wb = worldBindBoneMatrices4(project);
  const k = boneIds.length;
  const out: Vec2[] = [];
  for (let i = 0; i < k; i++) {
    const M = wb.get(boneIds[i]!);
    if (!M) return null;
    const o = transformPointMat4(M, 0, 0, 0);
    out.push({ x: o.x, y: o.y });
  }
  const last = project.bones.find((b) => b.id === boneIds[k - 1]!);
  const Mlast = wb.get(boneIds[k - 1]!);
  if (!last || !Mlast) return null;
  const tip = transformPointMat4(Mlast, last.length, 0, 0);
  out.push({ x: tip.x, y: tip.y });
  return out;
}

function segmentLengthsFromBindPts(pts: Vec2[]): number[] {
  const L: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    L.push(Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y));
  }
  return L.map((l) => Math.max(l, 1e-6));
}

function fkWorldJointPoints(project: EditorProject, time: number, boneIds: string[]): Vec2[] | null {
  const cache = poseFkAtTimeCached(project, time);
  const fk4 = cache.fk4;
  const k = boneIds.length;
  const out: Vec2[] = [];
  for (let i = 0; i < k; i++) {
    const M = fk4.get(boneIds[i]!);
    if (!M) return null;
    const o = transformPointMat4(M, 0, 0, 0);
    out.push({ x: o.x, y: o.y });
  }
  const last = project.bones.find((b) => b.id === boneIds[k - 1]!);
  const Mlast = fk4.get(boneIds[k - 1]!);
  if (!last || !Mlast) return null;
  const tip = transformPointMat4(Mlast, last.length, 0, 0);
  out.push({ x: tip.x, y: tip.y });
  return out;
}

function fabrikChainHasTiltOrSpin(project: EditorProject, time: number, boneIds: string[]): boolean {
  const clip = activeClip(project);
  for (const id of boneIds) {
    const b = project.bones.find((x) => x.id === id);
    if (!b) return true;
    const s = getLocalBoneState(b, clip, time);
    if (Math.abs(s.tilt) > 1e-5 || Math.abs(s.spin) > 1e-5) return true;
  }
  return false;
}

/**
 * Absolute local Z rotations (radians) for every bone in the FABRIK chain.
 */
export function fabrikIkAbsoluteLocalRotsAtTime(
  project: EditorProject,
  time: number,
  chainId: string,
): Map<string, number> | null {
  const chain = getFabrikIkChainById(project, chainId);
  if (!chain || !chain.enabled) return null;
  const ids = chain.boneIds;
  if (!validateFabrikBoneChain(project, ids)) return null;
  if (fabrikChainHasTiltOrSpin(project, time, ids)) return null;

  const bindPts = bindWorldJointPoints(project, ids);
  if (!bindPts) return null;
  const lengths = segmentLengthsFromBindPts(bindPts);

  const init = fkWorldJointPoints(project, time, ids);
  if (!init) return null;

  const ovr = sampleIkTargetOverride2d(project, chain.id, time);
  const target: Vec2 = { x: ovr?.x ?? chain.targetX, y: ovr?.y ?? chain.targetY };

  const rootFixed = init[0]!;
  const solved = fabrik2dChain(rootFixed, init, lengths, target, 28);

  const cache = poseFkAtTimeCached(project, time);
  const mats = cache.mats2d;

  const k = ids.length;
  const worldAngles: number[] = [];
  for (let i = 0; i < k; i++) {
    const a = solved[i]!;
    const b = solved[i + 1]!;
    worldAngles.push(Math.atan2(b.y - a.y, b.x - a.x));
  }

  const out = new Map<string, number>();
  const root = project.bones.find((b) => b.id === ids[0]!);
  if (!root) return null;
  const parentId = root.parentId;
  const Wp = parentId ? mats.get(parentId) : null;
  const parentWorld = Wp ? angleFromMat2d(Wp) : 0;
  out.set(ids[0]!, unwrapAngle(worldAngles[0]! - parentWorld));
  for (let i = 1; i < k; i++) {
    out.set(ids[i]!, unwrapAngle(worldAngles[i]! - worldAngles[i - 1]!));
  }
  return out;
}
