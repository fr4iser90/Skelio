import {
  ASSETS_DIRECTORY_NAME,
  dehydrateEditorProjectForFolder,
  hydrateEditorProjectFromFolder,
  PROJECT_MANIFEST_FILE,
  type EditorProject,
} from "@skelio/domain";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Ensures `assets/` exists and writes the editor JSON manifest. */
export function writeProjectToDirectory(projectRoot: string, editorJson: string): void {
  mkdirSync(join(projectRoot, ASSETS_DIRECTORY_NAME), { recursive: true });
  writeFileSync(join(projectRoot, PROJECT_MANIFEST_FILE), editorJson, "utf8");
}

/** Writes manifest + `assets/meshes/*.skelio-mesh.json` sidecars from inline geometry. */
export function writeEditorProjectToDirectory(projectRoot: string, project: EditorProject): void {
  mkdirSync(join(projectRoot, ASSETS_DIRECTORY_NAME), { recursive: true });
  const { manifest, meshAssetFiles } = dehydrateEditorProjectForFolder(project);
  for (const f of meshAssetFiles) {
    const full = join(projectRoot, ...f.relativePath.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf8");
  }
  writeFileSync(join(projectRoot, PROJECT_MANIFEST_FILE), JSON.stringify(manifest, null, 2), "utf8");
}

/** Reads manifest and hydrates external mesh files. */
export async function readEditorProjectFromDirectory(projectRoot: string): Promise<EditorProject> {
  const manifestJson = readFileSync(join(projectRoot, PROJECT_MANIFEST_FILE), "utf8");
  const raw = JSON.parse(manifestJson) as EditorProject;
  return hydrateEditorProjectFromFolder(raw, (rel) =>
    Promise.resolve(readFileSync(join(projectRoot, ...rel.split("/")), "utf8")),
  );
}

/** Reads `project.skelio.json` from the given directory (no mesh hydration). */
export function readProjectFromDirectory(projectRoot: string): string {
  return readFileSync(join(projectRoot, PROJECT_MANIFEST_FILE), "utf8");
}
