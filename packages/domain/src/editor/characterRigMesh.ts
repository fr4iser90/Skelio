import type { CharacterRigBinding, CharacterRigSpriteSlice, EditorProject, SkinnedMesh } from "./types.js";
import { mat4Invert, transformPointMat4 } from "./mat4.js";
import { worldBindBoneMatrices4 } from "./bone3dPose.js";

/** Stable id for meshes generated from Character Rig slices (`syncCharacterRigSkinnedMeshes`). */
export const RIG_SLICE_MESH_ID_PREFIX = "rig_slice_";

export function rigSliceSkinnedMeshId(sliceId: string): string {
  return `${RIG_SLICE_MESH_ID_PREFIX}${sliceId}`;
}

/** Bound bone for a slice: only a valid `characterRig.bindings` row (no mesh inference). */
export function resolveCharacterRigSliceBoundBoneId(project: EditorProject, sliceId: string): string | null {
  const boneIds = new Set(project.bones.map((b) => b.id));
  const rig = project.characterRig;
  const fromBinding = rig?.bindings?.find((b) => b.sliceId === sliceId)?.boneId;
  if (fromBinding && boneIds.has(fromBinding)) return fromBinding;
  return null;
}

/**
 * True when every sprite slice that has pixels (w/h positive) has a binding to an existing bone.
 * Used to gate 3D / meshing.
 */
export function characterRigBindingsComplete(project: EditorProject): boolean {
  const rig = project.characterRig;
  if (!rig?.slices?.length) return false;
  const boneIds = new Set(project.bones.map((b) => b.id));
  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b.boneId] as const));
  let anyPixelSlice = false;
  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    anyPixelSlice = true;
    const bid = bindingBySlice.get(s.id);
    if (!bid || !boneIds.has(bid)) return false;
  }
  return anyPixelSlice;
}

function influenceRow(boneId: string): { boneId: string; weight: number }[] {
  return [{ boneId, weight: 1 }];
}

/**
 * Adaptive grid density along one axis (world px). Spine/Smack use dense meshes; we start from a
 * uniform grid so deformation is not a single stretched quad.
 */
function gridSegmentCount(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 3;
  const cells = Math.ceil(span / 44);
  return Math.max(3, Math.min(14, cells));
}

function buildSubdividedRectMesh2d(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  boneId: string,
  yOffset = 0,
): Pick<SkinnedMesh, "vertices" | "indices" | "influences"> {
  const su = gridSegmentCount(hw * 2);
  const sv = gridSegmentCount(hh * 2);
  const infl = influenceRow(boneId);
  const verts: { x: number; y: number }[] = [];
  for (let j = 0; j <= sv; j++) {
    const v = j / sv;
    const y = cy - hh + v * (2 * hh) + yOffset;
    for (let i = 0; i <= su; i++) {
      const u = i / su;
      const x = cx - hw + u * (2 * hw);
      verts.push({ x, y });
    }
  }
  const influences = verts.map(() => infl);
  const indices: number[] = [];
  const row = su + 1;
  for (let j = 0; j < sv; j++) {
    for (let i = 0; i < su; i++) {
      const bl = i + j * row;
      const br = bl + 1;
      const tl = bl + row;
      const tr = tl + 1;
      indices.push(bl, br, tr, bl, tr, tl);
    }
  }
  return { vertices: verts, indices, influences };
}

/** Zwei parallele Unterflächen (front/back) wie bisher 8 Vertices — jetzt jeweils unterteilt. */
function buildSubdividedDepthSliceMesh2d(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  boneId: string,
  fy: number,
  by: number,
): Pick<SkinnedMesh, "vertices" | "indices" | "influences"> {
  const front = buildSubdividedRectMesh2d(cx, cy, hw, hh, boneId, fy);
  const back = buildSubdividedRectMesh2d(cx, cy, hw, hh, boneId, by);
  const base = front.vertices.length;
  const vertices = [...front.vertices, ...back.vertices];
  const influences = [...front.influences, ...back.influences];
  const indices = [...front.indices, ...back.indices.map((i) => i + base)];
  return { vertices, indices, influences };
}

/**
 * Builds one skinned mesh per slice that has pixel size and a bone binding.
 * Flat slices: **subdivided grid** on the slice AABB (Spine-like first step vs a single quad).
 * If `maxDepthFront` / `maxDepthBack` are set (see {@link CharacterRigSliceDepth}), uses two subdivided
 * faces (front/back offset in Y), same grid density as flat slices — not a bare 8-vertex box.
 */
export function skinnedMeshesFromCharacterRig(project: EditorProject): SkinnedMesh[] {
  const rig = project.characterRig;
  if (!rig?.slices?.length) return [];

  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b] as const));
  const out: SkinnedMesh[] = [];
  const Wbind4 = worldBindBoneMatrices4(project);

  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const binding = bindingBySlice.get(s.id) as CharacterRigBinding | undefined;
    const boneId = binding?.boneId;
    if (!boneId) continue;

    const depth = rig.sliceDepths?.find((d) => d.sliceId === s.id);
    const df = Math.max(0, depth?.maxDepthFront ?? 0);
    const dbRaw = depth?.syncBackWithFront ? df : Math.max(0, depth?.maxDepthBack ?? 0);
    const db = depth?.syncBackWithFront ? df : dbRaw;

    const mesh = sliceToSkinnedMesh(s, binding, Wbind4.get(boneId) ?? null, df, db);
    out.push(mesh);
  }

  return out;
}

function sliceToSkinnedMesh(
  s: CharacterRigSpriteSlice,
  binding: CharacterRigBinding,
  Wbind4: Float64Array | null,
  maxDepthFront: number,
  maxDepthBack: number,
): SkinnedMesh {
  // Use the same anchor semantics as rigidCharacterRigSliceWorldPose:
  // center the mesh at the binding anchor in bind-local space (default sliceCenter).
  let cx = s.worldCx;
  let cy = s.worldCy;
  const ax = binding.localX;
  const ay = binding.localY;
  const az = binding.localZ ?? 0;
  if (Wbind4 && ax != null && ay != null) {
    const wp = transformPointMat4(Wbind4, ax, ay, az);
    cx = wp.x;
    cy = wp.y;
  } else if (Wbind4) {
    // Backwards compat: if locals are missing, derive them from the slice layout center at bind.
    const inv = mat4Invert(Wbind4);
    if (inv) {
      const loc = transformPointMat4(inv, s.worldCx, s.worldCy, 0);
      const wp = transformPointMat4(Wbind4, loc.x, loc.y, 0);
      cx = wp.x;
      cy = wp.y;
    }
  }
  const hw = s.width / 2;
  const hh = s.height / 2;
  const id = rigSliceSkinnedMeshId(s.id);
  const name = `rig_${s.name.replace(/\s+/g, "_")}`;

  const hasDepth = maxDepthFront > 1e-6 || maxDepthBack > 1e-6;

  if (!hasDepth) {
    const grid = buildSubdividedRectMesh2d(cx, cy, hw, hh, binding.boneId);
    return {
      id,
      name,
      vertices: grid.vertices,
      indices: grid.indices,
      influences: grid.influences,
    };
  }

  const fy = -maxDepthFront;
  const by = maxDepthBack;
  const depthMesh = buildSubdividedDepthSliceMesh2d(cx, cy, hw, hh, binding.boneId, fy, by);
  return {
    id,
    name,
    vertices: depthMesh.vertices,
    indices: depthMesh.indices,
    influences: depthMesh.influences,
  };
}
