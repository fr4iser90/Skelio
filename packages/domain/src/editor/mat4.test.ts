import { describe, expect, it } from "vitest";
import { mat4Identity, mat4Multiply, mat4Translate } from "./mat4.js";

describe("mat4Multiply", () => {
  it("identity * translate = translate", () => {
    const I = mat4Identity();
    const T = mat4Translate(2, -3, 1.5);
    const R = mat4Multiply(I, T);
    expect(R[12]).toBeCloseTo(2);
    expect(R[13]).toBeCloseTo(-3);
    expect(R[14]).toBeCloseTo(1.5);
  });
});
