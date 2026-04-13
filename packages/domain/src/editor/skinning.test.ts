import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { worldBindBoneMatrices, worldPoseBoneMatrices } from "./pose.js";
import { createDemoSkinnedMesh } from "./demoMesh.js";
import { deformSkinnedMesh } from "./skinning.js";

describe("deformSkinnedMesh", () => {
  it("leaves vertices unchanged when pose matches bind (no keys)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    const mesh = createDemoSkinnedMesh(root);
    const bind = worldBindBoneMatrices(p);
    const pose = worldPoseBoneMatrices(p, 0);
    const out = deformSkinnedMesh(mesh, bind, pose);
    expect(out.length).toBe(mesh.vertices.length);
    for (let i = 0; i < mesh.vertices.length; i++) {
      expect(out[i]!.x).toBeCloseTo(mesh.vertices[i]!.x, 5);
      expect(out[i]!.y).toBeCloseTo(mesh.vertices[i]!.y, 5);
    }
  });
});
