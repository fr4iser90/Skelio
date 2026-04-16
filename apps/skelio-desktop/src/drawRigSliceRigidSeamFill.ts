import type { CharacterRigSpriteSlice } from "@skelio/domain";

/** World-space thickness of edge color extrusion (same units as bone layout). */
export const DEFAULT_SEAM_EXTRUDE_WORLD = 28;
/** Slight destination scale-up so texture bleeds past the nominal rect. */
export const DEFAULT_DEST_PAD_WORLD = 8;

const colorCache = new Map<string, { n: string; s: string; e: string; w: string }>();

function cacheKey(s: CharacterRigSpriteSlice, embedded: boolean): string {
  return `${s.id}|${embedded}|${s.sheetId ?? ""}|${s.x}|${s.y}|${s.width}|${s.height}`;
}

function averageStripRgba(data: Uint8ClampedArray, pick: (byteIndex: number) => boolean): string {
  let r = 0,
    g = 0,
    b = 0,
    a = 0,
    n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (!pick(i)) continue;
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    a += data[i + 3]!;
    n++;
  }
  if (n === 0) return "rgba(40,40,44,0.96)";
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  const alpha = Math.min(1, (a / n / 255) * 1.02);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Average RGBA for each sprite edge (same sampling as seam-fill bands). */
export function rigidSliceEdgeAverageColors(
  img: CanvasImageSource,
  s: CharacterRigSpriteSlice,
  embedded: boolean,
): { n: string; s: string; e: string; w: string } {
  const key = cacheKey(s, embedded);
  const hit = colorCache.get(key);
  if (hit) return hit;

  const sw = Math.max(1, Math.floor(s.width));
  const sh = Math.max(1, Math.floor(s.height));
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const xctx = c.getContext("2d", { willReadFrequently: true });
  if (!xctx) {
    const fb = "rgba(55,55,60,0.97)";
    const o = { n: fb, s: fb, e: fb, w: fb };
    colorCache.set(key, o);
    return o;
  }
  if (embedded) {
    xctx.drawImage(img, 0, 0, sw, sh);
  } else {
    xctx.drawImage(img, s.x, s.y, s.width, s.height, 0, 0, sw, sh);
  }
  const data = xctx.getImageData(0, 0, sw, sh).data;

  const north = averageStripRgba(data, (i) => {
    const p = i / 4;
    const y = Math.floor(p / sw);
    return y === 0;
  });
  const south = averageStripRgba(data, (i) => {
    const p = i / 4;
    const y = Math.floor(p / sw);
    return y === sh - 1;
  });
  const east = averageStripRgba(data, (i) => {
    const p = i / 4;
    const x = p % sw;
    return x === sw - 1;
  });
  const west = averageStripRgba(data, (i) => {
    const p = i / 4;
    const x = p % sw;
    return x === 0;
  });

  const o = { n: north, s: south, e: east, w: west };
  colorCache.set(key, o);
  return o;
}

/**
 * Draws a rigid slice with (1) slightly oversized quad (texture bleed) and (2) four extruded bands
 * filled with the average color of each image edge — reduces visible grid between separate parts.
 * Heuristic only; does not invent high-frequency texture detail.
 */
export function drawRigSliceRigidWithSeamFill(
  ctx: CanvasRenderingContext2D,
  s: CharacterRigSpriteSlice,
  img: CanvasImageSource,
  embedded: boolean,
  opts?: { extrudeWorld?: number; destPadWorld?: number },
): void {
  const extrude = opts?.extrudeWorld ?? DEFAULT_SEAM_EXTRUDE_WORLD;
  const pad = opts?.destPadWorld ?? DEFAULT_DEST_PAD_WORLD;
  const hw = s.width / 2 + pad;
  const hh = s.height / 2 + pad;

  const { n, s: cs, e, w } = rigidSliceEdgeAverageColors(img, s, embedded);

  ctx.fillStyle = n;
  ctx.fillRect(-hw, -hh - extrude, 2 * hw, extrude);
  ctx.fillStyle = cs;
  ctx.fillRect(-hw, hh, 2 * hw, extrude);
  ctx.fillStyle = w;
  ctx.fillRect(-hw - extrude, -hh, extrude, 2 * hh);
  ctx.fillStyle = e;
  ctx.fillRect(hw, -hh, extrude, 2 * hh);

  if (embedded) {
    ctx.drawImage(img, -hw, -hh, 2 * hw, 2 * hh);
  } else {
    ctx.drawImage(img, s.x, s.y, s.width, s.height, -hw, -hh, 2 * hw, 2 * hh);
  }
}

export function invalidateRigidSeamFillCacheForSlice(sliceId: string): void {
  for (const k of colorCache.keys()) {
    if (k.startsWith(`${sliceId}|`)) colorCache.delete(k);
  }
}
