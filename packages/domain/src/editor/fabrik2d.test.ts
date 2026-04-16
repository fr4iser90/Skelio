import { describe, expect, it } from "vitest";
import { fabrik2dChain, fabrik2dThreeJoints } from "./ik2d.js";

describe("fabrik2dChain", () => {
  it("matches fabrik2dThreeJoints for two segments", () => {
    const rootFixed = { x: 0, y: 0 };
    const p1Init = { x: 50, y: 10 };
    const p2Init = { x: 100, y: 0 };
    const lengths: [number, number] = [60, 50];
    const target = { x: 120, y: 40 };
    const a = fabrik2dThreeJoints(rootFixed, p1Init, p2Init, lengths, target, 30);
    const b = fabrik2dChain(rootFixed, [rootFixed, p1Init, p2Init], [...lengths], target, 30);
    expect(b.length).toBe(3);
    expect(b[0]!.x).toBeCloseTo(a.p0.x, 5);
    expect(b[0]!.y).toBeCloseTo(a.p0.y, 5);
    expect(b[1]!.x).toBeCloseTo(a.p1.x, 4);
    expect(b[1]!.y).toBeCloseTo(a.p1.y, 4);
    expect(b[2]!.x).toBeCloseTo(a.p2.x, 4);
    expect(b[2]!.y).toBeCloseTo(a.p2.y, 4);
  });
});
