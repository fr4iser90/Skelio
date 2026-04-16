import { describe, expect, it } from "vitest";
import type { CharacterRigConfig, EditorProject } from "./types.js";
import { createDefaultEditorProject } from "./projectFactory.js";
import {
  DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC,
  ensureMinimalSliceDepthOnMeshSync,
} from "./characterRigDepthSeed.js";
import { skinnedMeshesFromCharacterRig } from "./characterRigMesh.js";

function setPrimaryCharacterRig(p: EditorProject, rig: CharacterRigConfig): void {
  const id = p.characters?.[0]?.id;
  if (id && p.characterRigs) {
    p.characterRigs[id] = rig;
    delete p.characterRig;
  } else {
    p.characterRig = rig;
  }
}

function primaryRig(p: EditorProject): CharacterRigConfig {
  const id = p.characters?.[0]?.id;
  if (id && p.characterRigs?.[id]) return p.characterRigs[id]!;
  return p.characterRig!;
}

function minimalRigProject() {
  const p = createDefaultEditorProject();
  const root = p.bones.find((b) => b.parentId === null)!;
  setPrimaryCharacterRig(p, {
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
  });
  return p;
}

describe("ensureMinimalSliceDepthOnMeshSync", () => {
  it("adds default depth for bound pixel slices with zero depth", () => {
    const p = minimalRigProject();
    const q = ensureMinimalSliceDepthOnMeshSync(p);
    const d = primaryRig(q).sliceDepths.find((x) => x.sliceId === "slice_x")!;
    expect(d.maxDepthFront).toBe(DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC);
    expect(d.maxDepthBack).toBe(DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC);
    expect(d.syncBackWithFront).toBe(true);

    const meshes = skinnedMeshesFromCharacterRig(q);
    const m = meshes.find((x) => x.id.startsWith("rig_slice_"))!;
    expect(m.vertices.length).toBeGreaterThan(4);
  });

  it("does not overwrite non-zero depth", () => {
    const p = minimalRigProject();
    primaryRig(p).sliceDepths = [
      {
        sliceId: "slice_x",
        maxDepthFront: 12,
        maxDepthBack: 12,
        syncBackWithFront: true,
      },
    ];
    const q = ensureMinimalSliceDepthOnMeshSync(p);
    expect(primaryRig(q).sliceDepths[0]!.maxDepthFront).toBe(12);
  });
});
