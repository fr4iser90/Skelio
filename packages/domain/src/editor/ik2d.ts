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
