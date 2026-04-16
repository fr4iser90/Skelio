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

describe("computeDirectedEdgeMargins (gap filling)", () => {
  it("returns minimal margins when no joints provided", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, []);
    expect(margins.left).toBe(4);
    expect(margins.right).toBe(4);
    expect(margins.top).toBe(4);
    expect(margins.bottom).toBe(4);
  });

  it("extends RIGHT edge when joint is to the right of slice", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [{ x: 200, y: 100 }]);
    expect(margins.right).toBe(40);
    expect(margins.left).toBe(4);
    expect(margins.top).toBe(4);
    expect(margins.bottom).toBe(4);
  });

  it("extends LEFT edge when joint is to the left of slice", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [{ x: 0, y: 100 }]);
    expect(margins.left).toBe(40);
    expect(margins.right).toBe(4);
  });

  it("extends TOP edge when joint is above slice", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [{ x: 100, y: 0 }]);
    expect(margins.top).toBe(40);
    expect(margins.bottom).toBe(4);
  });

  it("extends BOTTOM edge when joint is below slice", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [{ x: 100, y: 200 }]);
    expect(margins.bottom).toBe(40);
    expect(margins.top).toBe(4);
  });

  it("extends MULTIPLE edges when multiple joints", () => {
    const margins = computeDirectedEdgeMargins(100, 100, 50, 30, [
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(margins.right).toBe(40);
    expect(margins.left).toBe(40);
    expect(margins.top).toBe(4);
    expect(margins.bottom).toBe(4);
  });
});

describe("directed edge margins integration", () => {
  it("applies larger margin when slice is near a child bone joint", () => {
    const sliceCx = 50;
    const sliceCy = 0;
    const sliceW = 60;
    const sliceH = 40;
    const childJoint = { x: 100, y: 0 };

    const margins = computeDirectedEdgeMargins(sliceCx, sliceCy, sliceW, sliceH, [childJoint]);
    expect(margins.right).toBe(40);
    expect(margins.left).toBe(4);
  });

  it("applies larger margin on BOTH sides when parent and child joints exist", () => {
    const sliceCx = 100;
    const sliceCy = 0;
    const sliceW = 50;
    const sliceH = 30;
    const parentTip = { x: 50, y: 0 };
    const childJoint = { x: 150, y: 0 };

    const margins = computeDirectedEdgeMargins(sliceCx, sliceCy, sliceW, sliceH, [parentTip, childJoint]);
    expect(margins.left).toBe(40);
    expect(margins.right).toBe(40);
    expect(margins.top).toBe(4);
    expect(margins.bottom).toBe(4);
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
