import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUNTIME_SCHEMA_VERSION } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const minimal = JSON.parse(
  readFileSync(join(__dirname, "../test/fixtures/runtime-minimal.valid.json"), "utf8"),
) as Record<string, unknown>;

describe("runtime export contract", () => {
  it("exports matching schema version constant", () => {
    expect(minimal.schemaVersion).toBe(RUNTIME_SCHEMA_VERSION);
  });

  it("fixture has required top-level keys", () => {
    expect(minimal).toMatchObject({
      schemaVersion: expect.any(String),
      meta: expect.objectContaining({
        coordinateSystem: "y-down",
      }),
      assets: expect.any(Array),
      armature: expect.objectContaining({ bones: expect.any(Array) }),
      animations: expect.any(Array),
    });
  });
});
