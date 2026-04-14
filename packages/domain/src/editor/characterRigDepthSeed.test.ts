import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import {
  DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC,
  ensureMinimalSliceDepthOnMeshSync,
} from "./characterRigDepthSeed.js";
import { skinnedMeshesFromCharacterRig } from "./characterRigMesh.js";

function minimalRigProject() {
  const p = createDefaultEditorProject();
  const root = p.bones.find((b) => b.parentId === null)!;
  p.characterRig = {
    spriteSheets: [],
    slices: [
      {
        id: "slice_x",
        name: "Part",
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        worldCx: 0,
        worldCy: 0,
      },
    ],
    bindings: [{ sliceId: "slice_x", boneId: root.id }],
    sliceDepths: [],
  };
  return p;
}

describe("ensureMinimalSliceDepthOnMeshSync", () => {
  it("adds default depth for bound pixel slices with zero depth", () => {
    const p = minimalRigProject();
    const q = ensureMinimalSliceDepthOnMeshSync(p);
    const d = q.characterRig!.sliceDepths.find((x) => x.sliceId === "slice_x")!;
    expect(d.maxDepthFront).toBe(DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC);
    expect(d.maxDepthBack).toBe(DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC);
    expect(d.syncBackWithFront).toBe(true);

    const meshes = skinnedMeshesFromCharacterRig(q);
    const m = meshes.find((x) => x.id.startsWith("rig_slice_"))!;
    expect(m.vertices.length).toBeGreaterThan(4);
  });

  it("does not overwrite non-zero depth", () => {
    const p = minimalRigProject();
    p.characterRig!.sliceDepths = [
      {
        sliceId: "slice_x",
        maxDepthFront: 12,
        maxDepthBack: 12,
        syncBackWithFront: true,
      },
    ];
    const q = ensureMinimalSliceDepthOnMeshSync(p);
    expect(q.characterRig!.sliceDepths[0]!.maxDepthFront).toBe(12);
  });
});
