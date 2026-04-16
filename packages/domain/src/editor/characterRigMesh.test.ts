import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import {
  characterRigBindingsComplete,
  computeDirectedEdgeMargins,
  resolveCharacterRigSliceBoundBoneId,
  rigSliceSkinnedMeshId,
  skinnedMeshesFromCharacterRig,
} from "./characterRigMesh.js";

describe("characterRigBindingsComplete", () => {
  it("is false when a pixel slice has no binding", () => {
    const p = createDefaultEditorProject();
    p.characterRig = {
      spriteSheets: [],
      slices: [
        {
          id: "a",
          name: "A",
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          worldCx: 0,
          worldCy: 0,
        },
        {
          id: "b",
          name: "B",
          x: 0,
          y: 0,
          width: 8,
          height: 8,
          worldCx: 0,
          worldCy: 0,
        },
      ],
      bindings: [],
      sliceDepths: [],
    };
    expect(characterRigBindingsComplete(p)).toBe(false);
    const root = p.bones[0]!.id;
    p.characterRig!.bindings = [{ sliceId: "a", boneId: root }];
    expect(characterRigBindingsComplete(p)).toBe(false);
    p.characterRig!.bindings = [
      { sliceId: "a", boneId: root },
      { sliceId: "b", boneId: root },
    ];
    expect(characterRigBindingsComplete(p)).toBe(true);
  });

  it("ignores empty slots and is false when there are no pixel slices", () => {
    const p = createDefaultEditorProject();
    p.characterRig = {
      spriteSheets: [],
      slices: [
        {
          id: "e",
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
    expect(characterRigBindingsComplete(p)).toBe(false);
  });
});

describe("skinnedMeshesFromCharacterRig", () => {
  it("builds a subdivided flat mesh for a bound slice with size", () => {
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
    expect(m.vertices.length).toBeGreaterThan(4);
    expect(m.indices.length).toBeGreaterThan(6);
    const first = m.vertices[0]!;
    const last = m.vertices[m.vertices.length - 1]!;
    expect(first.x).toBeLessThan(80);
    expect(first.y).toBeLessThan(190);
    expect(last.x).toBeGreaterThan(120);
    expect(last.y).toBeGreaterThan(210);
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

  it("adds subdivided front+back vertices when depth is set", () => {
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
    expect(m.vertices.length).toBeGreaterThan(8);
    expect(m.indices.length).toBeGreaterThan(12);
  });
});

describe("computeDirectedEdgeMargins (100% automatic)", () => {
  it("returns percentage-based margins when no joints provided", () => {
    // width=50 → baseMarginH = 50*0.02 = 1
    // height=30 → baseMarginV = 30*0.02 = 0.6
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, []);
    expect(margins.left).toBeCloseTo(1, 1);
    expect(margins.right).toBeCloseTo(1, 1);
    expect(margins.top).toBeCloseTo(0.6, 1);
    expect(margins.bottom).toBeCloseTo(0.6, 1);
  });

  it("automatically scales margin based on distance to joint (10% buffer)", () => {
    // Slice: center=100, width=50 → right edge at 125
    // Joint at x=200 → distance = 75
    // Margin = 75 * 1.1 = 82.5
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [{ x: 200, y: 100 }]);
    expect(margins.right).toBeCloseTo(82.5, 1);
  });

  it("applies minimum 8% of slice dimension toward joint", () => {
    // Slice width=100 → minJointMarginH = 8
    // Joint inside slice but to the right → applies 8% minimum
    const margins = computeDirectedEdgeMargins(100, 100, 100, 60, [{ x: 110, y: 100 }]);
    expect(margins.right).toBeCloseTo(8, 1); // 100 * 0.08
    expect(margins.left).toBeCloseTo(2, 1);   // 100 * 0.02 base
  });

  it("uses larger of distance-based or minimum percentage", () => {
    // Slice width=200 → minJointMarginH = 16
    // Joint far away → distance-based wins
    const margins = computeDirectedEdgeMargins(100, 100, 200, 100, [{ x: 500, y: 100 }]);
    // right edge at 200, joint at 500 → distance = 300
    // 300 * 1.1 = 330 > 16 (8% of 200)
    expect(margins.right).toBeCloseTo(330, 1);
  });
});

describe("resolveCharacterRigSliceBoundBoneId", () => {
  it("returns bone id when binding is valid", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p.characterRig = {
      spriteSheets: [],
      slices: [{ id: "s1", name: "A", x: 0, y: 0, width: 10, height: 10, worldCx: 0, worldCy: 0 }],
      bindings: [{ sliceId: "s1", boneId: root }],
      sliceDepths: [],
    };
    p.skinnedMeshes = skinnedMeshesFromCharacterRig(p);
    expect(resolveCharacterRigSliceBoundBoneId(p, "s1")).toBe(root);
  });

  it("returns null when bindings are empty even if rig_slice mesh exists", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p.characterRig = {
      spriteSheets: [],
      slices: [{ id: "s1", name: "A", x: 0, y: 0, width: 10, height: 10, worldCx: 0, worldCy: 0 }],
      bindings: [{ sliceId: "s1", boneId: root }],
      sliceDepths: [],
    };
    p.skinnedMeshes = skinnedMeshesFromCharacterRig(p);
    p.characterRig!.bindings = [];
    expect(resolveCharacterRigSliceBoundBoneId(p, "s1")).toBe(null);
  });

  it("returns null when binding references a deleted bone id", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p.characterRig = {
      spriteSheets: [],
      slices: [{ id: "s1", name: "A", x: 0, y: 0, width: 10, height: 10, worldCx: 0, worldCy: 0 }],
      bindings: [{ sliceId: "s1", boneId: root }],
      sliceDepths: [],
    };
    p.skinnedMeshes = skinnedMeshesFromCharacterRig(p);
    p.characterRig!.bindings = [{ sliceId: "s1", boneId: "deleted_bone" }];
    expect(resolveCharacterRigSliceBoundBoneId(p, "s1")).toBe(null);
  });
});
