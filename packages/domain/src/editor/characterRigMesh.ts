import type { CharacterRigSpriteSlice, EditorProject, SkinnedMesh } from "./types.js";

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
 * Builds one skinned mesh per slice that has pixel size and a bone binding.
 * Flat quad in bind/world space on the slice AABB (center `worldCx`/`worldCy`).
 * If `maxDepthFront` / `maxDepthBack` are set (see {@link CharacterRigSliceDepth}), adds a second quad
 * offset on Y (2.5D “thickness” in screen space).
 */
export function skinnedMeshesFromCharacterRig(project: EditorProject): SkinnedMesh[] {
  const rig = project.characterRig;
  if (!rig?.slices?.length) return [];

  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b.boneId] as const));
  const out: SkinnedMesh[] = [];

  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const boneId = bindingBySlice.get(s.id);
    if (!boneId) continue;

    const depth = rig.sliceDepths?.find((d) => d.sliceId === s.id);
    const df = Math.max(0, depth?.maxDepthFront ?? 0);
    const dbRaw = depth?.syncBackWithFront ? df : Math.max(0, depth?.maxDepthBack ?? 0);
    const db = depth?.syncBackWithFront ? df : dbRaw;

    const mesh = sliceToSkinnedMesh(s, boneId, df, db);
    out.push(mesh);
  }

  return out;
}

function sliceToSkinnedMesh(
  s: CharacterRigSpriteSlice,
  boneId: string,
  maxDepthFront: number,
  maxDepthBack: number,
): SkinnedMesh {
  const cx = s.worldCx;
  const cy = s.worldCy;
  const hw = s.width / 2;
  const hh = s.height / 2;
  const id = rigSliceSkinnedMeshId(s.id);
  const name = `rig_${s.name.replace(/\s+/g, "_")}`;

  const hasDepth = maxDepthFront > 1e-6 || maxDepthBack > 1e-6;

  if (!hasDepth) {
    const infl = influenceRow(boneId);
    return {
      id,
      name,
      vertices: [
        { x: cx - hw, y: cy - hh },
        { x: cx + hw, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
      ],
      indices: [0, 1, 2, 0, 2, 3],
      influences: [infl, infl, infl, infl],
    };
  }

  const fy = -maxDepthFront;
  const by = maxDepthBack;
  const infl = influenceRow(boneId);
  const infl8 = [infl, infl, infl, infl, infl, infl, infl, infl];

  return {
    id,
    name,
    vertices: [
      { x: cx - hw, y: cy - hh + fy },
      { x: cx + hw, y: cy - hh + fy },
      { x: cx + hw, y: cy + hh + fy },
      { x: cx - hw, y: cy + hh + fy },
      { x: cx - hw, y: cy - hh + by },
      { x: cx + hw, y: cy - hh + by },
      { x: cx + hw, y: cy + hh + by },
      { x: cx - hw, y: cy + hh + by },
    ],
    indices: [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7],
    influences: infl8,
  };
}
