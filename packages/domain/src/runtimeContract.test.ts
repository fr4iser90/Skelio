import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { createDemoSkinnedMesh } from "./editor/demoMesh.js";
import { editorProjectToRuntime } from "./editor/runtimeExport.js";
import { createDefaultEditorProject } from "./editor/projectFactory.js";
import { RUNTIME_SCHEMA_VERSION } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "../../../schemas/runtime-1.1.0.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateRuntime = ajv.compile(schema);

const minimal = JSON.parse(
  readFileSync(join(__dirname, "../test/fixtures/runtime-minimal.valid.json"), "utf8"),
) as Record<string, unknown>;

function assertValid(data: unknown, label: string) {
  const ok = validateRuntime(data);
  if (!ok) {
    throw new Error(`${label}: ${ajv.errorsText(validateRuntime.errors)}`);
  }
}

describe("runtime export contract", () => {
  it("exports matching schema version constant", () => {
    expect(minimal.schemaVersion).toBe(RUNTIME_SCHEMA_VERSION);
  });

  it("fixture validates against runtime-1.1.0.json", () => {
    assertValid(minimal, "fixture");
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
      skins: expect.any(Array),
    });
    expect((minimal.skins as unknown[]).length).toBe(1);
  });

  it("default editor project runtime export validates", () => {
    const p = createDefaultEditorProject();
    const rt = editorProjectToRuntime(p);
    assertValid(rt, "default export");
    expect(rt.skins).toEqual([]);
  });

  it("runtime export with demo mesh validates", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p.skinnedMeshes = [createDemoSkinnedMesh(root)];
    const rt = editorProjectToRuntime(p);
    assertValid(rt, "with skin");
    expect(rt.skins.length).toBe(1);
    expect(rt.skins[0]!.indices.length).toBe(6);
  });
});
