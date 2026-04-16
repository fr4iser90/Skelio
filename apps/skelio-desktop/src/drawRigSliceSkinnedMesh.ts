import type { CharacterRigSpriteSlice, SkinnedMesh } from "@skelio/domain";
import { drawTexturedTriangle } from "./drawTexturedTriangle.js";

/** Bind-space → texture pixel (sprite sheet sub-rect or full embedded image). */
function bindPointToTexturePx(
  s: CharacterRigSpriteSlice,
  bx: number,
  by: number,
  imgW: number,
  imgH: number,
  sheet: boolean,
): { sx: number; sy: number } {
  const cx = s.worldCx;
  const cy = s.worldCy;
  const hw = s.width / 2;
  const hh = s.height / 2;
  const u = (bx - (cx - hw)) / Math.max(s.width, 1e-6);
  const v = (by - (cy - hh)) / Math.max(s.height, 1e-6);
  const uc = Math.min(1, Math.max(0, u));
  const vc = Math.min(1, Math.max(0, v));
  if (sheet) {
    return {
      sx: s.x + uc * s.width,
      sy: s.y + vc * s.height,
    };
  }
  return {
    sx: uc * imgW,
    sy: vc * imgH,
  };
}

/**
 * Paints a character-rig slice using its `rig_slice_*` skinned mesh: deformed positions,
 * UVs implied from bind vertices vs slice world rect (same basis as {@link sliceToSkinnedMesh}).
 */
export function drawRigSliceSkinnedDeformed(
  ctx: CanvasRenderingContext2D,
  s: CharacterRigSpriteSlice,
  mesh: SkinnedMesh,
  deformed: { x: number; y: number }[],
  img: CanvasImageSource,
  embedded: boolean,
): void {
  const iw = "naturalWidth" in img && img.naturalWidth > 0 ? img.naturalWidth : s.width;
  const ih = "naturalHeight" in img && img.naturalHeight > 0 ? img.naturalHeight : s.height;
  const idx = mesh.indices;
  const bind = mesh.vertices;
  for (let ti = 0; ti + 2 < idx.length; ti += 3) {
    const ia = idx[ti]!;
    const ib = idx[ti + 1]!;
    const ic = idx[ti + 2]!;
    const ba = bind[ia];
    const bb = bind[ib];
    const bc = bind[ic];
    const da = deformed[ia];
    const db = deformed[ib];
    const dc = deformed[ic];
    if (!ba || !bb || !bc || !da || !db || !dc) continue;
    const pa = bindPointToTexturePx(s, ba.x, ba.y, iw, ih, !embedded);
    const pb = bindPointToTexturePx(s, bb.x, bb.y, iw, ih, !embedded);
    const pc = bindPointToTexturePx(s, bc.x, bc.y, iw, ih, !embedded);
    drawTexturedTriangle(ctx, img, pa.sx, pa.sy, pb.sx, pb.sy, pc.sx, pc.sy, da.x, da.y, db.x, db.y, dc.x, dc.y);
  }
}
