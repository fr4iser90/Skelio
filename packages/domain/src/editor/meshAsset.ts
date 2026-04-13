import type { EditorProject, SkinInfluence, SkinnedMesh } from "./types.js";
import { ASSETS_DIRECTORY_NAME } from "../constants.js";

export const SKELIO_MESH_FORMAT = "skelio-mesh-1" as const;

export type MeshPayloadV1 = {
  format: typeof SKELIO_MESH_FORMAT;
  vertices: { x: number; y: number }[];
  indices: number[];
  influences: SkinInfluence[][];
};

/** Stable path under project root: `assets/meshes/<sanitizedId>.skelio-mesh.json`. */
export function meshAssetRelativePath(meshId: string): string {
  const safe = meshId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ASSETS_DIRECTORY_NAME}/meshes/${safe}.skelio-mesh.json`;
}

export function serializeMeshPayload(mesh: SkinnedMesh): string {
  const p: MeshPayloadV1 = {
    format: SKELIO_MESH_FORMAT,
    vertices: mesh.vertices.map((v) => ({ x: v.x, y: v.y })),
    indices: [...mesh.indices],
    influences: mesh.influences.map((row) => row.map((x) => ({ boneId: x.boneId, weight: x.weight }))),
  };
  return JSON.stringify(p, null, 2);
}

export function parseMeshPayload(json: string): MeshPayloadV1 | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: "mesh file is not valid JSON" };
  }
  if (!data || typeof data !== "object") return { error: "mesh payload invalid" };
  const o = data as Record<string, unknown>;
  if (o.format !== SKELIO_MESH_FORMAT) return { error: "unsupported mesh file format" };
  if (!Array.isArray(o.vertices) || !Array.isArray(o.indices) || !Array.isArray(o.influences)) {
    return { error: "mesh payload missing arrays" };
  }
  return o as MeshPayloadV1;
}

export type DehydratedFolderProject = {
  /** Manifest JSON: meshes reference `assetPath` with empty geometry arrays. */
  manifest: EditorProject;
  meshAssetFiles: { relativePath: string; content: string }[];
};

/**
 * Splits mesh geometry into sidecar files; manifest keeps `id`/`name`/`assetPath` only.
 * In-memory `project` is not mutated.
 */
export function dehydrateEditorProjectForFolder(project: EditorProject): DehydratedFolderProject {
  const manifest = structuredClone(project);
  const meshAssetFiles: { relativePath: string; content: string }[] = [];
  if (!manifest.skinnedMeshes?.length) {
    return { manifest, meshAssetFiles };
  }
  manifest.skinnedMeshes = manifest.skinnedMeshes.map((m) => {
    const relativePath = meshAssetRelativePath(m.id);
    meshAssetFiles.push({ relativePath, content: serializeMeshPayload(m) });
    return {
      id: m.id,
      name: m.name,
      assetPath: relativePath,
      vertices: [],
      indices: [],
      influences: [],
    };
  });
  return { manifest, meshAssetFiles };
}

/**
 * Loads mesh payloads from disk into the project. Removes `assetPath` after merge (editor works with inline geometry).
 */
export async function hydrateEditorProjectFromFolder(
  project: EditorProject,
  readText: (relativePath: string) => Promise<string>,
): Promise<EditorProject> {
  const p = structuredClone(project);
  if (!p.skinnedMeshes?.length) return p;
  for (const m of p.skinnedMeshes) {
    const rel = m.assetPath;
    if (!rel) continue;
    const text = await readText(rel);
    const parsed = parseMeshPayload(text);
    if ("error" in parsed) {
      throw new Error(`${rel}: ${parsed.error}`);
    }
    m.vertices = parsed.vertices;
    m.indices = parsed.indices;
    m.influences = parsed.influences;
    delete m.assetPath;
  }
  return p;
}

/** Self-contained JSON (e.g. download): strips `assetPath` so geometry stays inline. */
export function stripMeshAssetPaths(project: EditorProject): EditorProject {
  const p = structuredClone(project);
  if (!p.skinnedMeshes?.length) return p;
  for (const m of p.skinnedMeshes) {
    delete m.assetPath;
  }
  return p;
}
