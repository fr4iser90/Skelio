import type { Bone, CharacterRigConfig, CharacterRigSpriteSlice } from "@skelio/domain";
import { rigidSliceEdgeAverageColors } from "./drawRigSliceRigidSeamFill.js";

type RigidPose = { cx: number; cy: number; rot: number };

export function firstSliceForBone(rig: CharacterRigConfig, boneId: string): CharacterRigSpriteSlice | null {
  for (const b of rig.bindings ?? []) {
    if (b.boneId !== boneId) continue;
    const s = rig.slices?.find((x) => x.id === b.sliceId);
    if (s && s.width > 0 && s.height > 0) return s;
  }
  return null;
}

export function worldRectEdges(cx: number, cy: number, w: number, h: number, rot: number) {
  const hw = w / 2;
  const hh = h / 2;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const toW = (lx: number, ly: number) => ({
    x: cx + lx * c - ly * s,
    y: cy + lx * s + ly * c,
  });
  const corners = [toW(-hw, -hh), toW(hw, -hh), toW(hw, hh), toW(-hw, hh)];
  return [
    { name: "n" as const, a: corners[0]!, b: corners[1]!, mid: toW(0, -hh) },
    { name: "e" as const, a: corners[1]!, b: corners[2]!, mid: toW(hw, 0) },
    { name: "s" as const, a: corners[2]!, b: corners[3]!, mid: toW(0, hh) },
    { name: "w" as const, a: corners[3]!, b: corners[0]!, mid: toW(-hw, 0) },
  ];
}

/** Dark edge averages disappear on #16171c — nudge toward mid-gray so fills read as “closed”. */
function liftDarkRgba(css: string): string {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (!m) return css;
  let r = +m[1]!;
  let g = +m[2]!;
  let b = +m[3]!;
  const a = m[4] != null ? +m[4]! : 1;
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (L < 0.2) {
    const t = 0.5;
    r = Math.round(r * (1 - t) + 92 * t);
    g = Math.round(g * (1 - t) + 94 * t);
    b = Math.round(b * (1 - t) + 100 * t);
  }
  return `rgba(${r},${g},${b},${Math.min(1, a * 1.02)})`;
}

function scaleQuadFromCenter(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  scale: number,
): [number, number, number, number, number, number, number, number] {
  const mx = (ax + bx + cx + dx) / 4;
  const my = (ay + by + cy + dy) / 4;
  const s = (x: number, y: number) => [mx + (x - mx) * scale, my + (y - my) * scale] as const;
  const [a0, a1] = s(ax, ay);
  const [b0, b1] = s(bx, by);
  const [c0, c1] = s(cx, cy);
  const [d0, d1] = s(dx, dy);
  return [a0, a1, b0, b1, c0, c1, d0, d1];
}

/** Clamps a world point onto an axis-aligned box in the slice’s local frame (stops bone tips outside art). */
function closestPointOnOrientedRect(
  px: number,
  py: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
): { x: number; y: number } {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  const hw = w / 2;
  const hh = h / 2;
  const clx = Math.max(-hw, Math.min(hw, lx));
  const cly = Math.max(-hh, Math.min(hh, ly));
  const cc = Math.cos(rot);
  const ss = Math.sin(rot);
  return {
    x: cx + clx * cc - cly * ss,
    y: cy + clx * ss + cly * cc,
  };
}

export function pickEdgeNearestMid(
  edges: ReturnType<typeof worldRectEdges>,
  tx: number,
  ty: number,
) {
  let best = edges[0]!;
  let bestD = Infinity;
  for (const e of edges) {
    const dx = e.mid.x - tx;
    const dy = e.mid.y - ty;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Viewport-only: draws gradient quads between rigid slices on adjacent bones (parent → child).
 * Uses average edge colors — fills large gaps visually, not high-frequency texture.
 */
export function drawRigidSliceGapBridges(
  ctx: CanvasRenderingContext2D,
  opts: {
    bones: readonly Bone[];
    rig: CharacterRigConfig;
    getSliceRigid: (s: CharacterRigSpriteSlice) => RigidPose | null;
    getSliceCenter: (s: CharacterRigSpriteSlice) => { cx: number; cy: number };
    getSliceImage: (s: CharacterRigSpriteSlice) => { img: CanvasImageSource; embedded: boolean } | null;
    /** Parent-Spitze + Kind-Gelenk (wird auf die Slice-Rechtecke geklemmt, sonst „Strahlen“ ins Leere). */
    getBridgePickPoints?: (
      parentBoneId: string,
      childBoneId: string,
    ) => { parentTip: { x: number; y: number }; childJoint: { x: number; y: number } } | null;
    useGapBridgeForSlice?: (s: CharacterRigSpriteSlice) => boolean;
  },
): void {
  const { bones, rig, getSliceRigid, getSliceCenter, getSliceImage } = opts;
  const useBridge = opts.useGapBridgeForSlice ?? (() => true);

  for (const bone of bones) {
    if (!bone.parentId) continue;
    const parentSlice = firstSliceForBone(rig, bone.parentId);
    const childSlice = firstSliceForBone(rig, bone.id);
    if (!parentSlice || !childSlice) continue;
    if (!useBridge(parentSlice) || !useBridge(childSlice)) continue;

    const rigidP = getSliceRigid(parentSlice);
    const rigidC = getSliceRigid(childSlice);
    if (!rigidP || !rigidC) continue;

    const imgP = getSliceImage(parentSlice);
    const imgC = getSliceImage(childSlice);

    const cP = getSliceCenter(parentSlice);
    const cC = getSliceCenter(childSlice);
    const edgesP = worldRectEdges(rigidP.cx, rigidP.cy, parentSlice.width, parentSlice.height, rigidP.rot);
    const edgesC = worldRectEdges(rigidC.cx, rigidC.cy, childSlice.width, childSlice.height, rigidC.rot);

    const skel = opts.getBridgePickPoints?.(bone.parentId, bone.id);
    let towardChild = { x: cC.cx, y: cC.cy };
    let towardParent = { x: cP.cx, y: cP.cy };
    if (skel) {
      towardChild = closestPointOnOrientedRect(
        skel.childJoint.x,
        skel.childJoint.y,
        rigidC.cx,
        rigidC.cy,
        childSlice.width,
        childSlice.height,
        rigidC.rot,
      );
      towardParent = closestPointOnOrientedRect(
        skel.parentTip.x,
        skel.parentTip.y,
        rigidP.cx,
        rigidP.cy,
        parentSlice.width,
        parentSlice.height,
        rigidP.rot,
      );
    }

    const eP = pickEdgeNearestMid(edgesP, towardChild.x, towardChild.y);
    const eC = pickEdgeNearestMid(edgesC, towardParent.x, towardParent.y);

    const FALLBACK = "rgba(78, 82, 102, 0.96)";
    let colP: string;
    let colC: string;
    if (imgP && imgC) {
      const colsP = rigidSliceEdgeAverageColors(imgP.img, parentSlice, imgP.embedded);
      const colsC = rigidSliceEdgeAverageColors(imgC.img, childSlice, imgC.embedded);
      colP = liftDarkRgba(colsP[eP.name]);
      colC = liftDarkRgba(colsC[eC.name]);
    } else {
      colP = FALLBACK;
      colC = FALLBACK;
    }

    const dx = eP.mid.x - eC.mid.x;
    const dy = eP.mid.y - eC.mid.y;
    const gap = Math.hypot(dx, dy);
    if (gap < 2) continue;
    const maxDim = Math.max(parentSlice.width, parentSlice.height, childSlice.width, childSlice.height);
    /** No „Strahlen“: Knochen-Spitze außerhalb Sprite → riesige Quads; Kappe relativ zur Slice-Größe. */
    const maxReasonableGap = Math.min(4000, Math.max(380, 3.2 * maxDim));
    if (gap > maxReasonableGap) continue;

    const inflate = 1 + Math.min(0.22, gap * 0.00035);
    const [ax, ay, bx, by, cx, cy, dx2, dy2] = scaleQuadFromCenter(
      eP.a.x,
      eP.a.y,
      eP.b.x,
      eP.b.y,
      eC.b.x,
      eC.b.y,
      eC.a.x,
      eC.a.y,
      inflate,
    );

    const g = ctx.createLinearGradient(eP.mid.x, eP.mid.y, eC.mid.x, eC.mid.y);
    g.addColorStop(0, colP);
    g.addColorStop(1, colC);

    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(dx2, dy2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
