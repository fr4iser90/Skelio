import { describe, expect, it } from "vitest";
import { mat4Identity, mat4Invert, mat4Multiply, mat4Translate, transformPointMat4 } from "./mat4.js";

describe("mat4Invert", () => {
  it("inverts translation round-trip", () => {
    const a = mat4Translate(12, -34, 5);
    const inv = mat4Invert(a);
    expect(inv).not.toBeNull();
    const p = transformPointMat4(a, 3, 4, 0);
    const q = transformPointMat4(inv!, p.x, p.y, p.z);
    expect(q.x).toBeCloseTo(3, 6);
    expect(q.y).toBeCloseTo(4, 6);
    expect(q.z).toBeCloseTo(0, 6);
  });

  it("satisfies M * M^-1 = I", () => {
    const a = mat4Translate(1, 2, 3);
    const inv = mat4Invert(a)!;
    const prod = mat4Multiply(a, inv);
    const id = mat4Identity();
    for (let i = 0; i < 16; i++) {
      expect(prod[i]).toBeCloseTo(id[i]!, 9);
    }
  });
});
