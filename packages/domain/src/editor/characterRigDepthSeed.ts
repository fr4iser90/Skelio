import type { CharacterRigConfig, CharacterRigSliceDepth, EditorProject } from "./types.js";
import { iterCharacterRigs } from "./characterSlots.js";

/**
 * Default extrusion (world units ≈ px) applied on mesh sync when a bound slice
 * would otherwise be paper-thin (no depth configured yet).
 */
export const DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC = 6;

function ensureMinimalSliceDepthForOneRig(
  rig: CharacterRigConfig,
  project: EditorProject,
): boolean {
  if (!rig?.slices?.length) return false;

  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b.boneId] as const));
  const boneIds = new Set(project.bones.map((b) => b.id));

  const depthList: CharacterRigSliceDepth[] = [...(rig.sliceDepths ?? [])];
  let touched = false;

  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const bid = bindingBySlice.get(s.id);
    if (!bid || !boneIds.has(bid)) continue;

    const i = depthList.findIndex((d) => d.sliceId === s.id);
    const existing = i >= 0 ? depthList[i] : undefined;
    const df = Math.max(0, existing?.maxDepthFront ?? 0);
    const sync = existing?.syncBackWithFront ?? true;
    const dbRaw = Math.max(0, existing?.maxDepthBack ?? 0);
    const db = sync ? df : dbRaw;
    if (df + db > 1e-3) continue;

    const next: CharacterRigSliceDepth = {
      sliceId: s.id,
      maxDepthFront: DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC,
      maxDepthBack: DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC,
      syncBackWithFront: true,
      depthTextureFront: existing?.depthTextureFront,
      depthTextureBack: existing?.depthTextureBack,
    };
    if (i >= 0) depthList[i] = next;
    else depthList.push(next);
    touched = true;
  }

  if (!touched) return false;

  rig.sliceDepths = depthList;
  return true;
}

/**
 * For every character rig: for each bound slice with pixels, if `maxDepthFront` + effective back sum to ~0,
 * set a minimal symmetric depth so `skinnedMeshesFromCharacterRig` and the 3D
 * viewport produce visible thickness. Preserves existing depth textures.
 */
export function ensureMinimalSliceDepthOnMeshSync(project: EditorProject): EditorProject {
  let touched = false;
  for (const rig of iterCharacterRigs(project)) {
    if (ensureMinimalSliceDepthForOneRig(rig, project)) touched = true;
  }
  if (!touched) return project;
  return project;
}
