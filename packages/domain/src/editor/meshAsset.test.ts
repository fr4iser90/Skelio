import { describe, expect, it } from "vitest";
import { createDemoSkinnedMesh } from "./demoMesh.js";
import { createDefaultEditorProject } from "./projectFactory.js";
import { validateEditorProject } from "./validate.js";
import {
  dehydrateEditorProjectForFolder,
  hydrateEditorProjectFromFolder,
  stripMeshAssetPaths,
} from "./meshAsset.js";

describe("meshAsset folder roundtrip", () => {
  it("dehydrates and hydrates with identical geometry", async () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    const mesh = createDemoSkinnedMesh(root);
    p.skinnedMeshes = [mesh];

    const { manifest, meshAssetFiles } = dehydrateEditorProjectForFolder(p);
    expect(meshAssetFiles.length).toBe(1);
    expect(manifest.skinnedMeshes![0]!.assetPath).toBeDefined();
    expect(manifest.skinnedMeshes![0]!.vertices.length).toBe(0);
    expect(validateEditorProject(manifest).length).toBeGreaterThan(0);

    const files = new Map(meshAssetFiles.map((f) => [f.relativePath, f.content]));
    const hydrated = await hydrateEditorProjectFromFolder(manifest, (rel) => {
      const c = files.get(rel);
      if (c === undefined) throw new Error(`missing ${rel}`);
      return Promise.resolve(c);
    });
    expect(hydrated.skinnedMeshes![0]!.vertices.length).toBe(mesh.vertices.length);
    expect(hydrated.skinnedMeshes![0]!.assetPath).toBeUndefined();
    expect(validateEditorProject(hydrated)).toHaveLength(0);
  });

  it("stripMeshAssetPaths is a no-op when no assetPath", () => {
    const p = createDefaultEditorProject();
    const s = stripMeshAssetPaths(p);
    expect(s).toEqual(p);
  });
});
