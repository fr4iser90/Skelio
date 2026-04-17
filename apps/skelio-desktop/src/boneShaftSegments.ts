/**
 * Viewport-only bone shaft geometry.
 *
 * Primary segment follows **local +X × length** (matches Inspector “length” and skinning bone axis).
 * With **one child**, if the child joint differs from the parent tip (bind offset / planar opts),
 * a short **tip → child** segment connects the chain without replacing the authored shaft length.
 * Multi-child rigs still use joint → each child joint (branching).
 */
import type { Bone, Mat4 } from "@skelio/domain";
import { transformPointMat4 } from "@skelio/domain";

export type BoneShaftSeg2 = { ax: number; ay: number; bx: number; by: number };

/** Optional: shaft preview while dragging bone length (single-child case normally follows child joint). */
export type BoneShaftSegmentsOpts = {
  lengthPreviewBoneId?: string | null;
};

function distPointToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

/** World-space shaft segments for bone `b` (joint → tip or joint → each child joint). */
export function boneShaftSegmentsWorld2D(
  b: Bone,
  allBones: readonly Bone[],
  boneM4: ReadonlyMap<string, Mat4>,
  boneOrigins: ReadonlyMap<string, { x: number; y: number }>,
  Lvis: number,
  opts?: BoneShaftSegmentsOpts,
): BoneShaftSeg2[] {
  const M4 = boneM4.get(b.id);
  if (!M4) return [];
  const p0 = transformPointMat4(M4, 0, 0, 0);
  const tip = transformPointMat4(M4, Lvis, 0, 0);
  const kids = allBones.filter((x) => x.parentId === b.id);
  if (kids.length === 0) {
    return [{ ax: p0.x, ay: p0.y, bx: tip.x, by: tip.y }];
  }
  if (kids.length === 1) {
    if (opts?.lengthPreviewBoneId === b.id) {
      return [{ ax: p0.x, ay: p0.y, bx: tip.x, by: tip.y }];
    }
    const oc = boneOrigins.get(kids[0]!.id);
    const alongLength = { ax: p0.x, ay: p0.y, bx: tip.x, by: tip.y };
    if (!oc) return [alongLength];
    const gap = Math.hypot(oc.x - tip.x, oc.y - tip.y);
    if (gap <= 1e-4) return [alongLength];
    return [alongLength, { ax: tip.x, ay: tip.y, bx: oc.x, by: oc.y }];
  }
  const out: BoneShaftSeg2[] = [];
  for (const c of kids) {
    const oc = boneOrigins.get(c.id);
    if (oc) out.push({ ax: p0.x, ay: p0.y, bx: oc.x, by: oc.y });
  }
  return out.length ? out : [{ ax: p0.x, ay: p0.y, bx: tip.x, by: tip.y }];
}

export function minDistPointToBoneShaftSegmentsSq(
  px: number,
  py: number,
  segments: readonly BoneShaftSeg2[],
): number {
  let m = Infinity;
  for (const s of segments) {
    const d = distPointToSegmentSq(px, py, s.ax, s.ay, s.bx, s.by);
    if (d < m) m = d;
  }
  return m;
}
