import type { SkinnedMesh } from "./types.js";

/** File base name without `.obj` (for mesh `name`). */
export function meshDisplayNameFromFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const without = base.replace(/\.obj$/i, "");
  return without.length > 0 ? without : "mesh";
}

function resolveObjVertexIndex(raw: number, vertexCount: number): number | null {
  if (!Number.isFinite(raw) || raw === 0 || !Number.isInteger(raw)) return null;
  if (raw > 0) return raw - 1;
  const idx = vertexCount + raw;
  return idx >= 0 && idx < vertexCount ? idx : null;
}

function triangulateFace(face: number[]): [number, number, number][] {
  if (face.length < 3) return [];
  if (face.length === 3) {
    const a = face[0]!;
    const b = face[1]!;
    const c = face[2]!;
    return [[a, b, c]];
  }
  const tris: [number, number, number][] = [];
  const a0 = face[0]!;
  for (let i = 1; i + 1 < face.length; i++) {
    tris.push([a0, face[i]!, face[i + 1]!]);
  }
  return tris;
}

/**
 * Minimal Wavefront OBJ: `v` vertices, `f` faces (triangles or polygons, fan-triangulated).
 * Uses the first two components of each `v` line as 2D coordinates; third component ignored.
 * Supports positive and negative face indices per OBJ spec.
 */
export function skinnedMeshFromObjText(
  text: string,
  options: {
    id: string;
    name: string;
    boneId: string;
    /** Negate imported Y (e.g. when the mesh was authored Y-up). Default false. */
    flipY?: boolean;
  },
): { mesh: SkinnedMesh } | { error: string } {
  const lines = text.split(/\r?\n/);
  const vertices: { x: number; y: number }[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    const tag = parts[0];
    if (tag === "v" && parts.length >= 3) {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return { error: "invalid vertex: non-finite coordinates" };
      }
      vertices.push({ x, y });
    }
  }

  const vertexCount = vertices.length;
  const faceCornerIndices: number[][] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split(/\s+/);
    const tag = parts[0];
    if (tag === "f" && parts.length >= 4) {
      const corner: number[] = [];
      for (let pi = 1; pi < parts.length; pi++) {
        const token = parts[pi]!;
        const viStr = token.split("/")[0] ?? "";
        if (!viStr) continue;
        const raw = parseInt(viStr, 10);
        const idx = resolveObjVertexIndex(raw, vertexCount);
        if (idx === null) {
          return { error: `invalid face index: ${token}` };
        }
        corner.push(idx);
      }
      if (corner.length >= 3) faceCornerIndices.push(corner);
    }
  }

  if (vertices.length === 0) {
    return { error: "OBJ has no vertices" };
  }

  const indices: number[] = [];
  for (const face of faceCornerIndices) {
    for (const tri of triangulateFace(face)) {
      indices.push(tri[0]!, tri[1]!, tri[2]!);
    }
  }

  if (indices.length === 0) {
    return { error: "OBJ has no faces" };
  }

  const flipY = options.flipY === true;
  const vertsOut = flipY ? vertices.map((v) => ({ x: v.x, y: -v.y })) : vertices;

  const influences = vertsOut.map(() => [{ boneId: options.boneId, weight: 1 }]);

  return {
    mesh: {
      id: options.id,
      name: options.name,
      vertices: vertsOut,
      indices,
      influences,
    },
  };
}
