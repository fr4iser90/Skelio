import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { rigSliceSkinnedMeshId, skinnedMeshesFromCharacterRig } from "./characterRigMesh.js";

describe("skinnedMeshesFromCharacterRig", () => {
  it("builds a flat quad for a bound slice with size", () => {
    let p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    p.characterRig = {
      spriteSheets: [],
      slices: [
        {
          id: "slice_a",
          name: "Arm",
          x: 0,
          y: 0,
          width: 40,
          height: 20,
          worldCx: 100,
          worldCy: 200,
        },
      ],
      bindings: [{ sliceId: "slice_a", boneId: root.id }],
      sliceDepths: [],
    };
    const meshes = skinnedMeshesFromCharacterRig(p);
    expect(meshes).toHaveLength(1);
    const m = meshes[0]!;
    expect(m.id).toBe(rigSliceSkinnedMeshId("slice_a"));
    expect(m.vertices).toHaveLength(4);
    expect(m.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(m.vertices[0]).toEqual({ x: 80, y: 190 });
    expect(m.vertices[2]).toEqual({ x: 120, y: 210 });
  });

  it("skips unbound slices and empty slots", () => {
    let p = createDefaultEditorProject();
    p.characterRig = {
      spriteSheets: [],
      slices: [
        {
          id: "u",
          name: "X",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          worldCx: 0,
          worldCy: 0,
        },
        {
          id: "empty",
          name: "E",
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          worldCx: 0,
          worldCy: 0,
        },
      ],
      bindings: [],
      sliceDepths: [],
    };
    expect(skinnedMeshesFromCharacterRig(p)).toHaveLength(0);
  });

  it("adds eight vertices when depth is set", () => {
    let p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    p.characterRig = {
      spriteSheets: [],
      slices: [
        {
          id: "s1",
          name: "Body",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          worldCx: 0,
          worldCy: 0,
        },
      ],
      bindings: [{ sliceId: "s1", boneId: root.id }],
      sliceDepths: [
        { sliceId: "s1", maxDepthFront: 4, maxDepthBack: 2, syncBackWithFront: false },
      ],
    };
    const m = skinnedMeshesFromCharacterRig(p)[0]!;
    expect(m.vertices).toHaveLength(8);
    expect(m.indices.length).toBe(12);
  });
});
