/**
 * Draw one textured triangle (Canvas 2D): affine map from image pixel space to world space,
 * clip to source triangle, then drawImage — used for skinned / deformed rig slices.
 */
export function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  wx0: number,
  wy0: number,
  wx1: number,
  wy1: number,
  wx2: number,
  wy2: number,
): void {
  const den = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(den) < 1e-9) return;

  const a = (wx0 * (sy1 - sy2) + wx1 * (sy2 - sy0) + wx2 * (sy0 - sy1)) / den;
  const c = (wx0 * (sx2 - sx1) + wx1 * (sx0 - sx2) + wx2 * (sx1 - sx0)) / den;
  const e = (wx0 * (sx1 * sy2 - sx2 * sy1) + wx1 * (sx2 * sy0 - sx0 * sy2) + wx2 * (sx0 * sy1 - sx1 * sy0)) / den;

  const b = (wy0 * (sy1 - sy2) + wy1 * (sy2 - sy0) + wy2 * (sy0 - sy1)) / den;
  const d = (wy0 * (sx2 - sx1) + wy1 * (sx0 - sx2) + wy2 * (sx1 - sx0)) / den;
  const f = (wy0 * (sx1 * sy2 - sx2 * sy1) + wy1 * (sx2 * sy0 - sx0 * sy2) + wy2 * (sx0 * sy1 - sx1 * sy0)) / den;

  ctx.save();
  /** `transform` multipliziert auf die Viewport-Matrix (Pan/Zoom/Zentrum). `setTransform` würde die ersetzen → alles links oben. */
  ctx.transform(a, b, c, d, e, f);
  ctx.beginPath();
  ctx.moveTo(sx0, sy0);
  ctx.lineTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
