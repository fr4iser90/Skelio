import { describe, expect, it } from "vitest";
import { validateSkinnedMesh } from "./skinning.js";
import { meshDisplayNameFromFileName, skinnedMeshFromObjText } from "./objImport.js";

describe("meshDisplayNameFromFileName", () => {
  it("strips .obj and path", () => {
    expect(meshDisplayNameFromFileName("C:/models/foo.obj")).toBe("foo");
    expect(meshDisplayNameFromFileName("bar.OBJ")).toBe("bar");
  });
});

describe("skinnedMeshFromObjText", () => {
  it("parses triangle and assigns full weight to bone", () => {
    const obj = `
      v 0 0 0
      v 10 0 0
      v 0 10 0
      f 1 2 3
    `;
    const r = skinnedMeshFromObjText(obj, { id: "m1", name: "tri", boneId: "bone_root" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.mesh.vertices).toHaveLength(3);
    expect(r.mesh.indices).toEqual([0, 1, 2]);
    expect(r.mesh.influences.every((row) => row.length === 1 && row[0]!.boneId === "bone_root" && row[0]!.weight === 1)).toBe(
      true,
    );
    expect(validateSkinnedMesh(r.mesh, new Set(["bone_root"]))).toHaveLength(0);
  });

  it("triangulates quads", () => {
    const obj = `
      v 0 0 0
      v 1 0 0
      v 1 1 0
      v 0 1 0
      f 1 2 3 4
    `;
    const r = skinnedMeshFromObjText(obj, { id: "q", name: "quad", boneId: "b" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.mesh.indices.length).toBe(6);
  });

  it("supports negative indices", () => {
    const obj = `
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f -3 -2 -1
    `;
    const r = skinnedMeshFromObjText(obj, { id: "m", name: "n", boneId: "b" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.mesh.indices).toEqual([0, 1, 2]);
  });

  it("parses v/vt/vn face form", () => {
    const obj = `
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f 1/1/1 2/2/2 3/3/3
    `;
    const r = skinnedMeshFromObjText(obj, { id: "m", name: "x", boneId: "b" });
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.mesh.indices).toEqual([0, 1, 2]);
  });

  it("rejects empty", () => {
    const r = skinnedMeshFromObjText("", { id: "m", name: "x", boneId: "b" });
    expect("error" in r).toBe(true);
    if (!("error" in r)) return;
    expect(r.error).toMatch(/no vertices/i);
  });
});
