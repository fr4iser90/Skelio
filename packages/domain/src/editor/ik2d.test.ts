import { describe, expect, it } from "vitest";
import { fabrik2dThreeJoints } from "./ik2d.js";

describe("fabrik2dThreeJoints", () => {
  it("pulls tip toward target along a straight chain", () => {
    const root = { x: 0, y: 0 };
    const p1 = { x: 50, y: 0 };
    const p2 = { x: 100, y: 0 };
    const target = { x: 80, y: 0 };
    const { p0, p1: q1, p2: q2 } = fabrik2dThreeJoints(root, p1, p2, [50, 50], target, 30);
    expect(p0.x).toBeCloseTo(0, 5);
    expect(q2.x).toBeCloseTo(80, 1);
    expect(Math.hypot(q1.x - p0.x, q1.y - p0.y)).toBeCloseTo(50, 1);
    expect(Math.hypot(q2.x - q1.x, q2.y - q1.y)).toBeCloseTo(50, 1);
  });
});
