import { describe, expect, it } from "vitest";
import { addBoneWeightDelta, normalizeInfluenceRow, sanitizeInfluenceRow } from "./influences.js";

describe("sanitizeInfluenceRow", () => {
  it("merges duplicates and scales when sum > 1", () => {
    const ids = new Set(["a", "b"]);
    const r = sanitizeInfluenceRow(
      [
        { boneId: "a", weight: 0.8 },
        { boneId: "a", weight: 0.8 },
        { boneId: "b", weight: 0.5 },
      ],
      ids,
    );
    const sum = r.reduce((s, x) => s + x.weight, 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-6);
    expect(r.length).toBe(2);
  });

  it("drops unknown bones", () => {
    const ids = new Set(["a"]);
    const r = sanitizeInfluenceRow([{ boneId: "x", weight: 1 }], ids);
    expect(r).toEqual([]);
  });

  it("keeps at most 8 influences", () => {
    const ids = new Set([..."abcdefghij"].map((c) => `b${c}`));
    const infl = [...ids].map((boneId) => ({ boneId, weight: 0.05 }));
    const r = sanitizeInfluenceRow(infl, ids);
    expect(r.length).toBe(8);
  });
});

describe("addBoneWeightDelta", () => {
  it("adds and clamps bone weight", () => {
    const ids = new Set(["a", "b"]);
    const r = addBoneWeightDelta([{ boneId: "a", weight: 0.3 }], "a", 0.5, ids);
    const a = r.find((x) => x.boneId === "a");
    expect(a?.weight).toBeCloseTo(0.8, 5);
  });
});

describe("normalizeInfluenceRow", () => {
  it("makes weights sum to 1", () => {
    const ids = new Set(["a", "b"]);
    const r = normalizeInfluenceRow(
      [
        { boneId: "a", weight: 2 },
        { boneId: "b", weight: 3 },
      ],
      ids,
    );
    const sum = r.reduce((s, x) => s + x.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});
