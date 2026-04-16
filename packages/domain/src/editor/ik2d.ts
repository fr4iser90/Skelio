/** 2D FABRIK for two segments / three joints (spike, ADR-0010). */

export type Vec2 = { x: number; y: number };

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function norm(v: Vec2): Vec2 {
  const l = len(v);
  return l > 1e-12 ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
}

function dist(a: Vec2, b: Vec2): number {
  return len(sub(a, b));
}

/** 2D cross product (z component); near zero means collinear joints. */
function cross2(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Two links, three joints: `rootFixed`–`p1`–`p2` with segment lengths `[L01, L12]`.
 * Iterative FABRIK; `p1Init`/`p2Init` are the FK starting pose (e.g. from world origins).
 */
export function fabrik2dThreeJoints(
  rootFixed: Vec2,
  p1Init: Vec2,
  p2Init: Vec2,
  lengths: [number, number],
  target: Vec2,
  iterations = 20,
): { p0: Vec2; p1: Vec2; p2: Vec2 } {
  const [L01, L12] = lengths;
  const L01c = Math.max(L01, 1e-6);
  const L12c = Math.max(L12, 1e-6);

  let p0: Vec2 = { ...rootFixed };
  // FABRIK can oscillate when root–mid–tip are perfectly collinear; nudge mid slightly.
  let p1: Vec2 = { ...p1Init };
  if (
    Math.abs(cross2(sub(p1, rootFixed), sub(p2Init, p1))) <
    1e-12 * (dist(rootFixed, p1) * dist(p1, p2Init) + 1e-12)
  ) {
    p1 = { x: p1.x, y: p1.y + 1e-6 };
  }
  let p2: Vec2 = { ...p2Init };

  for (let k = 0; k < iterations; k++) {
    const op0 = p0;
    const op1 = p1;

    // Backward
    p2 = { ...target };
    p1 = add(p2, scale(norm(sub(op1, p2)), L12c));
    p0 = add(p1, scale(norm(sub(op0, op1)), L01c));
    p0 = { ...rootFixed };
    // Forward (use positions from backward pass for directions)
    p1 = add(p0, scale(norm(sub(p1, p0)), L01c));
    p2 = add(p1, scale(norm(sub(p2, p1)), L12c));
  }

  return { p0, p1, p2 };
}

/**
 * Planar FABRIK for `lengths.length` segments and `lengths.length + 1` joints.
 * `init` has length `n + 1`; joint `n` follows `target`; joint `0` stays at `rootFixed`.
 */
export function fabrik2dChain(
  rootFixed: Vec2,
  init: Vec2[],
  lengths: number[],
  target: Vec2,
  iterations = 24,
): Vec2[] {
  const n = lengths.length;
  if (init.length !== n + 1) {
    throw new Error(`fabrik2dChain: expected ${n + 1} init points, got ${init.length}`);
  }
  const L = lengths.map((l) => Math.max(l, 1e-9));
  const p = init.map((v) => ({ ...v }));

  if (n >= 2) {
    const c = cross2(sub(p[1]!, p[0]!), sub(p[2]!, p[1]!));
    const scale0 = dist(p[0]!, p[1]!) * dist(p[1]!, p[2]!) + 1e-12;
    if (Math.abs(c) < 1e-12 * scale0) {
      p[1] = { x: p[1]!.x, y: p[1]!.y + 1e-6 };
    }
  }

  for (let k = 0; k < iterations; k++) {
    const op = p.map((v) => ({ ...v }));
    p[n] = { ...target };
    for (let i = n - 1; i >= 0; i--) {
      p[i] = add(p[i + 1]!, scale(norm(sub(op[i]!, p[i + 1]!)), L[i]!));
    }
    p[0] = { ...rootFixed };
    for (let i = 0; i < n; i++) {
      p[i + 1] = add(p[i]!, scale(norm(sub(p[i + 1]!, p[i]!)), L[i]!));
    }
  }

  return p;
}

/** Segment lengths from bind-pose joint positions (three bones in a chain). */
export function segmentLengthsFromBindOrigins(
  oRoot: Vec2,
  oMid: Vec2,
  oTip: Vec2,
): [number, number] {
  return [dist(oRoot, oMid), dist(oMid, oTip)];
}

/** IK link lengths from explicit bone `length` on root and mid bones. */
export function segmentLengthsFromBoneFields(lengthRoot: number, lengthMid: number): [number, number] {
  return [Math.max(lengthRoot, 1e-6), Math.max(lengthMid, 1e-6)];
}
