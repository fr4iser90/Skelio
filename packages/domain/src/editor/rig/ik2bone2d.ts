import type { Vec2 } from "../ik2d.js";

export type TwoBoneIkSolve2dOptions = {
  /**
   * Pole target in world space; chooses the elbow/knee bend direction.
   * If omitted, the solver picks the bend matching the current FK mid position.
   */
  pole?: Vec2;
  /** Allow reaching beyond max length by stretching lengths proportionally. Default: false. */
  allowStretch?: boolean;
  /** Small epsilon to avoid NaNs. */
  eps?: number;
};

export type TwoBoneIkSolve2dResult = {
  /** Solved mid joint position (world). */
  mid: Vec2;
  /** Solved tip position (world). */
  tip: Vec2;
  /** World angle (radians) of root bone local +X. */
  rootWorldAngle: number;
  /** World angle (radians) of mid bone local +X. */
  midWorldAngle: number;
  /** Whether the chain was stretched to reach the target. */
  stretched: boolean;
};

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function norm(v: Vec2, eps: number): Vec2 {
  const l = len(v);
  return l > eps ? { x: v.x / l, y: v.y / l } : { x: 1, y: 0 };
}

function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

function crossZ(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

/**
 * Analytic 2D two-bone IK.
 *
 * Inputs:
 * - root joint position p0
 * - FK mid/tip positions (used to pick default bend when no pole is given)
 * - segment lengths L0 (root→mid), L1 (mid→tip)
 * - target position
 *
 * Output:
 * - solved mid/tip positions
 * - world angles for root and mid (local +X directions)
 */
export function solveTwoBoneIk2d(
  p0: Vec2,
  p1fk: Vec2,
  lengths: [number, number],
  target: Vec2,
  opts?: TwoBoneIkSolve2dOptions,
): TwoBoneIkSolve2dResult {
  const eps = opts?.eps ?? 1e-9;
  let [L0, L1] = lengths;
  L0 = Math.max(L0, eps);
  L1 = Math.max(L1, eps);

  const toTgt = sub(target, p0);
  const d0 = len(toTgt);
  const maxReach = L0 + L1;
  const minReach = Math.abs(L0 - L1);

  let stretched = false;
  let d = d0;
  if (d > maxReach) {
    if (opts?.allowStretch) {
      const s = d / Math.max(eps, maxReach);
      L0 *= s;
      L1 *= s;
      stretched = true;
      d = d0;
    } else {
      d = maxReach;
    }
  }
  if (d < minReach) d = minReach;

  const dir = norm(toTgt, eps);

  // Law of cosines: distance from root to projection of mid onto the root->target line.
  // a = (L0^2 - L1^2 + d^2) / (2d)
  const a = (L0 * L0 - L1 * L1 + d * d) / (2 * Math.max(eps, d));
  const h2 = Math.max(0, L0 * L0 - a * a);
  const h = Math.sqrt(h2);

  // Perpendicular directions (left/right of dir).
  const perpL: Vec2 = { x: -dir.y, y: dir.x };
  const perpR: Vec2 = { x: dir.y, y: -dir.x };

  const pBase = add(p0, scale(dir, a));
  const candL = add(pBase, scale(perpL, h));
  const candR = add(pBase, scale(perpR, h));

  // Choose bend side.
  // - If pole given: pick candidate with mid closer to pole ray side.
  // - Else: pick candidate closer to FK mid.
  let p1 = candL;
  if (opts?.pole) {
    const pole = opts.pole;
    const side = crossZ(dir, sub(pole, p0));
    // side > 0 means "left" of dir
    p1 = side >= 0 ? candL : candR;
  } else {
    const dl = len(sub(candL, p1fk));
    const dr = len(sub(candR, p1fk));
    p1 = dl <= dr ? candL : candR;
  }

  // Tip lies on circle around mid; choose the one along root->target direction.
  // In exact math, p2 will equal target when within reach; when clamped, project along dir.
  let p2 = target;
  if (!opts?.allowStretch && d0 > maxReach) {
    p2 = add(p0, scale(dir, maxReach));
  }

  // Derive world angles (+X directions).
  const rootWorldAngle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const midWorldAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

  return { mid: p1, tip: p2, rootWorldAngle, midWorldAngle, stretched };
}

