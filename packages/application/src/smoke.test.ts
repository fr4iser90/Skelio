import { describe, expect, it } from "vitest";
import { RUNTIME_SCHEMA_VERSION } from "./index.js";

describe("@skelio/application", () => {
  it("re-exports domain constants", () => {
    expect(RUNTIME_SCHEMA_VERSION).toBe("1.1.0");
  });
});
