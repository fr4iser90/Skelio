import { apply, invert, multiply, type Mat2D } from "./mat2d.js";
import type { SkinnedMesh } from "./types.js";

const MAX_INFLUENCES = 8;

/**
 * Linear blend skinning in 2D: v' = Σ w_i · (W_i · W_i^{-1}_{bind}) · v
 * Vertices live in the same plane as bones (y-down).
 */
export function deformSkinnedMesh(
  mesh: SkinnedMesh,
  bindWorld: Map<string, Mat2D>,
  poseWorld: Map<string, Mat2D>,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const skinMatrices = new Map<string, Mat2D>();

  for (let vi = 0; vi < mesh.vertices.length; vi++) {
    const vx = mesh.vertices[vi]!.x;
    const vy = mesh.vertices[vi]!.y;
    const infl = mesh.influences[vi] ?? [];
    let ox = 0;
    let oy = 0;
    let wsum = 0;

    for (const inf of infl) {
      const w = inf.weight;
      if (w <= 0) continue;
      let sm = skinMatrices.get(inf.boneId);
      if (!sm) {
        const bw = bindWorld.get(inf.boneId);
        const pw = poseWorld.get(inf.boneId);
        if (!bw || !pw) continue;
        const invB = invert(bw);
        if (!invB) continue;
        sm = multiply(pw, invB);
        skinMatrices.set(inf.boneId, sm);
      }
      const p = apply(sm, vx, vy);
      ox += w * p.x;
      oy += w * p.y;
      wsum += w;
    }

    if (wsum > 1e-9) {
      ox /= wsum;
      oy /= wsum;
    } else {
      ox = vx;
      oy = vy;
    }
    out.push({ x: ox, y: oy });
  }
  return out;
}

export function validateSkinnedMesh(mesh: SkinnedMesh, boneIds: Set<string>): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  if (mesh.vertices.length === 0) {
    issues.push({ path: `skinnedMeshes.${mesh.id}.vertices`, message: "mesh has no vertices" });
    return issues;
  }
  if (mesh.influences.length !== mesh.vertices.length) {
    issues.push({
      path: `skinnedMeshes.${mesh.id}.influences`,
      message: "influences length must match vertices",
    });
  }
  if (mesh.indices.length % 3 !== 0) {
    issues.push({ path: `skinnedMeshes.${mesh.id}.indices`, message: "indices must be triangles (multiple of 3)" });
  }
  const maxIdx = mesh.vertices.length - 1;
  for (let i = 0; i < mesh.indices.length; i++) {
    const ix = mesh.indices[i]!;
    if (!Number.isInteger(ix) || ix < 0 || ix > maxIdx) {
      issues.push({ path: `skinnedMeshes.${mesh.id}.indices`, message: `invalid index at ${i}: ${ix}` });
      break;
    }
  }
  for (let vi = 0; vi < mesh.vertices.length; vi++) {
    const infl = mesh.influences[vi] ?? [];
    if (infl.length > MAX_INFLUENCES) {
      issues.push({
        path: `skinnedMeshes.${mesh.id}.influences[${vi}]`,
        message: `at most ${MAX_INFLUENCES} influences per vertex`,
      });
    }
    let sum = 0;
    for (const inf of infl) {
      if (!boneIds.has(inf.boneId)) {
        issues.push({
          path: `skinnedMeshes.${mesh.id}.influences[${vi}]`,
          message: `unknown boneId: ${inf.boneId}`,
        });
      }
      if (inf.weight < 0 || !Number.isFinite(inf.weight)) {
        issues.push({
          path: `skinnedMeshes.${mesh.id}.influences[${vi}]`,
          message: "weight must be finite and >= 0",
        });
      }
      sum += inf.weight;
    }
    if (sum > 1 + 1e-3) {
      issues.push({
        path: `skinnedMeshes.${mesh.id}.influences[${vi}]`,
        message: "influence weights sum must be <= 1",
      });
    }
  }
  return issues;
}
