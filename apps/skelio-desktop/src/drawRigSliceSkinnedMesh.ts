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
 * Zeichnet alle Mesh-Dreiecke mit Textur.
 * UV-Clamping sorgt dafür dass erweiterte Bereiche Rand-Pixel sampeln.
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

/**
 * Zeichnet NUR die Original-Dreiecke (innerhalb der Slice-Bounds).
 * Dreiecke mit Vertices außerhalb werden übersprungen.
 * Wird NACH drawRigSliceSkinnedDeformed aufgerufen → Original über Gap-Fill.
 */
export function drawRigSliceSkinnedDeformedOriginalOnly(
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
  const scx = s.worldCx;
  const scy = s.worldCy;
  const hw = s.width / 2;
  const hh = s.height / 2;

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

    const uA = (ba.x - (scx - hw)) / Math.max(s.width, 1e-6);
    const vA = (ba.y - (scy - hh)) / Math.max(s.height, 1e-6);
    const uB = (bb.x - (scx - hw)) / Math.max(s.width, 1e-6);
    const vB = (bb.y - (scy - hh)) / Math.max(s.height, 1e-6);
    const uC = (bc.x - (scx - hw)) / Math.max(s.width, 1e-6);
    const vC = (bc.y - (scy - hh)) / Math.max(s.height, 1e-6);

    if (uA < 0 || uA > 1 || vA < 0 || vA > 1) continue;
    if (uB < 0 || uB > 1 || vB < 0 || vB > 1) continue;
    if (uC < 0 || uC > 1 || vC < 0 || vC > 1) continue;

    const pa = bindPointToTexturePx(s, ba.x, ba.y, iw, ih, !embedded);
    const pb = bindPointToTexturePx(s, bb.x, bb.y, iw, ih, !embedded);
    const pc = bindPointToTexturePx(s, bc.x, bc.y, iw, ih, !embedded);

    drawTexturedTriangle(ctx, img, pa.sx, pa.sy, pb.sx, pb.sy, pc.sx, pc.sy, da.x, da.y, db.x, db.y, dc.x, dc.y);
  }
}
