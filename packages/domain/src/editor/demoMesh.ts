import { createId } from "./ids.js";
import type { SkinnedMesh } from "./types.js";

/** Axis-aligned quad around the origin, fully weighted to one bone (MVP demo). */
export function createDemoSkinnedMesh(rootBoneId: string): SkinnedMesh {
  return {
    id: createId("mesh"),
    name: "demo_quad",
    vertices: [
      { x: -50, y: -50 },
      { x: 50, y: -50 },
      { x: 50, y: 50 },
      { x: -50, y: 50 },
    ],
    indices: [0, 1, 2, 0, 2, 3],
    influences: [
      [{ boneId: rootBoneId, weight: 1 }],
      [{ boneId: rootBoneId, weight: 1 }],
      [{ boneId: rootBoneId, weight: 1 }],
      [{ boneId: rootBoneId, weight: 1 }],
    ],
  };
}
