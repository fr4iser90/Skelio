import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ASSETS_DIRECTORY_NAME,
  createDefaultEditorProject,
  createDemoSkinnedMesh,
  validateEditorProject,
} from "@skelio/domain";
import { describe, expect, it } from "vitest";
import {
  readEditorProjectFromDirectory,
  readProjectFromDirectory,
  writeEditorProjectToDirectory,
  writeProjectToDirectory,
} from "./projectFolder.js";

describe("projectFolder", () => {
  it("roundtrips manifest and creates assets dir", () => {
    const root = mkdtempSync(join(tmpdir(), "skelio-proj-"));
    try {
      const project = createDefaultEditorProject();
      const json = JSON.stringify(project, null, 2);
      writeProjectToDirectory(root, json);
      const back = readProjectFromDirectory(root);
      const parsed = JSON.parse(back) as Parameters<typeof validateEditorProject>[0];
      expect(validateEditorProject(parsed)).toHaveLength(0);
      const assetsPath = join(root, ASSETS_DIRECTORY_NAME);
      expect(existsSync(assetsPath)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("roundtrips skinned mesh via assets/meshes sidecar", async () => {
    const root = mkdtempSync(join(tmpdir(), "skelio-proj-mesh-"));
    try {
      const project = createDefaultEditorProject();
      const rootBone = project.bones[0]!.id;
      project.skinnedMeshes = [createDemoSkinnedMesh(rootBone)];
      writeEditorProjectToDirectory(root, project);
      const loaded = await readEditorProjectFromDirectory(root);
      expect(validateEditorProject(loaded)).toHaveLength(0);
      expect(loaded.skinnedMeshes?.[0]?.vertices.length).toBe(project.skinnedMeshes[0]!.vertices.length);
      expect(loaded.skinnedMeshes?.[0]?.assetPath).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
