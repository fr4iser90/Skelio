import { describe, expect, it } from "vitest";
import { mimeFromFileName, normalizeReferenceImageMime } from "./referenceImage.js";

describe("referenceImage mime helpers", () => {
  it("normalizes jpg alias and accepts webp", () => {
    expect(normalizeReferenceImageMime("image/jpg")).toBe("image/jpeg");
    expect(normalizeReferenceImageMime("IMAGE/WEBP")).toBe("image/webp");
    expect(normalizeReferenceImageMime("image/gif")).toBeNull();
  });

  it("infers mime from file name", () => {
    expect(mimeFromFileName("sprite.WEBP")).toBe("image/webp");
    expect(mimeFromFileName("x.jpeg")).toBe("image/jpeg");
    expect(mimeFromFileName("noext")).toBeNull();
  });
});
