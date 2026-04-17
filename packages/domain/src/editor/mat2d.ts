/** 2D affine column-style: x' = a*x + c*y + e, y' = b*x + d*y + f */

export type Mat2D = { a: number; b: number; c: number; d: number; e: number; f: number };

import type { Transform2D } from "./types.js";

export function fromTransform(t: Transform2D): Mat2D {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    a: cos * t.sx,
    b: sin * t.sx,
    c: -sin * t.sy,
    d: cos * t.sy,
    e: t.x,
    f: t.y,
  };
}

export function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function apply(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** Inverse of affine map; `null` if singular. */
/** Strip scale/shear; keep translation (matches 2D skinning / `mat2dMapToMat4RotationOnly` in the desktop app). */
export function rotationOnly2d(m: Mat2D): Mat2D {
  const ang = Math.atan2(m.b, m.a);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { a: c, b: s, c: -s, d: c, e: m.e, f: m.f };
}

export function invert(m: Mat2D): Mat2D | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-14) return null;
  const invDet = 1 / det;
  const ia = m.d * invDet;
  const ib = -m.b * invDet;
  const ic = -m.c * invDet;
  const id = m.a * invDet;
  const ie = -(ia * m.e + ic * m.f);
  const if_ = -(ib * m.e + id * m.f);
  return { a: ia, b: ib, c: ic, d: id, e: ie, f: if_ };
}
