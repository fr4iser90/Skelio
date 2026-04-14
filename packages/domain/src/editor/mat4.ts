/** Column-major 4×4 (OpenGL-style): index = col * 4 + row. */

export type Mat4 = Float64Array;

export function mat4Identity(): Mat4 {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + r] * b[c * 4 + k];
      }
      o[c * 4 + r] = s;
    }
  }
  return o;
}

export function mat4Translate(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mat4Scale(sx: number, sy: number, sz: number): Mat4 {
  const m = new Float64Array(16);
  m[0] = sx;
  m[5] = sy;
  m[10] = sz;
  m[15] = 1;
  return m;
}

/** Rotation about Z (axis through origin), right-handed. */
export function mat4RotateZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = new Float64Array(16);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** Rotation about X. */
export function mat4RotateX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  m[15] = 1;
  return m;
}

/** Rotation about Y. */
export function mat4RotateY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const m = new Float64Array(16);
  m[0] = c;
  m[2] = -s;
  m[5] = 1;
  m[8] = s;
  m[10] = c;
  m[15] = 1;
  return m;
}

export function transformPointMat4(m: Mat4, x: number, y: number, z: number): { x: number; y: number; z: number } {
  const xw = m[0] * x + m[4] * y + m[8] * z + m[12];
  const yw = m[1] * x + m[5] * y + m[9] * z + m[13];
  const zw = m[2] * x + m[6] * y + m[10] * z + m[14];
  return { x: xw, y: yw, z: zw };
}
