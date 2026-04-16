import { createId } from "./ids.js";
import type { AnimationClip, Bone, EditorProject } from "./types.js";

function rootBone(): Bone {
  const id = createId("bone");
  return {
    id,
    parentId: null,
    name: "root",
    bindPose: { x: 0, y: 0, rotation: 0, sx: 1, sy: 1 },
    length: 0,
  };
}

function emptyClip(id: string, name: string): AnimationClip {
  return { id, name, tracks: [] };
}

export function createDefaultEditorProject(): EditorProject {
  const root = rootBone();
  const clipId = createId("clip");
  const charId = createId("char");
  return {
    editorSchemaVersion: "1.0.0",
    meta: { name: "Untitled", fps: 60, clipTransformsRelativeToBind: true },
    bones: [root],
    clips: [emptyClip(clipId, "main")],
    activeClipId: clipId,
    characters: [{ id: charId, name: "Character", rootBoneId: root.id }],
    characterRigs: {
      [charId]: { spriteSheets: [], slices: [], bindings: [], sliceDepths: [] },
    },
  };
}
