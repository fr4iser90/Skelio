import { apply, invert, type Mat2D } from "./mat2d.js";
import {
  worldBindBoneMatrices2D,
  worldBindBoneMatrices2DOverridingBindPose,
  worldPoseBoneMatrices2D,
} from "./bone3dPose.js";
import type { AnimationClip, Bone, EditorProject, Transform2D } from "./types.js";

/** World bone matrices in bind pose (no animation). 2D-Projektion aus 4×4-Kette (ADR 0011). */
export function worldBindBoneMatrices(project: EditorProject): Map<string, Mat2D> {
  return worldBindBoneMatrices2D(project);
}

/** Like {@link worldBindBoneMatrices}, but one bone uses `bindPoseOverride` for FK (descendants follow). */
export function worldBindBoneMatricesOverridingBindPose(
  project: EditorProject,
  boneId: string,
  bindPoseOverride: Transform2D,
): Map<string, Mat2D> {
  return worldBindBoneMatrices2DOverridingBindPose(project, boneId, bindPoseOverride);
}

/** World bone matrices at animation time `time` (active clip). */
export function worldPoseBoneMatrices(project: EditorProject, time: number): Map<string, Mat2D> {
  return worldPoseBoneMatrices2D(project, time);
}

/** World bind-pose origins (bone tail at origin of child space = 0,0 in local). */
export function worldBindOrigins(project: EditorProject): Map<string, { x: number; y: number }> {
  const world = worldBindBoneMatrices(project);
  const origins = new Map<string, { x: number; y: number }>();
  for (const [id, m] of world) {
    origins.set(id, apply(m, 0, 0));
  }
  return origins;
}

/** World position of bone tip in bind pose: joint matrix · (length, 0). */
export function worldBindBoneTips(project: EditorProject): Map<string, { x: number; y: number }> {
  const mats = worldBindBoneMatrices(project);
  const tips = new Map<string, { x: number; y: number }>();
  for (const b of project.bones) {
    const m = mats.get(b.id);
    if (!m) continue;
    tips.set(b.id, apply(m, b.length, 0));
  }
  return tips;
}

/** Local +X distance used for tip hit-testing when `length` is tiny (so roots / zero bones stay grabbable). */
export const BONE_LENGTH_HIT_MIN_LOCAL = 24;

/** World point for picking the length handle: tip at max(length, {@link BONE_LENGTH_HIT_MIN_LOCAL}). */
export function worldBindBoneTipForLengthHit(project: EditorProject, boneId: string): { x: number; y: number } | null {
  const b = project.bones.find((x) => x.id === boneId);
  const m = worldBindBoneMatrices(project).get(boneId);
  if (!b || !m) return null;
  const L = Math.max(b.length, BONE_LENGTH_HIT_MIN_LOCAL);
  return apply(m, L, 0);
}

/** World tip at animation time (FK matrices; same basis as `worldPoseBoneMatrices`). */
export function worldPoseBoneTips(project: EditorProject, time: number): Map<string, { x: number; y: number }> {
  const mats = worldPoseBoneMatrices(project, time);
  const tips = new Map<string, { x: number; y: number }>();
  for (const b of project.bones) {
    const m = mats.get(b.id);
    if (!m) continue;
    tips.set(b.id, apply(m, b.length, 0));
  }
  return tips;
}

/**
 * Scalar length so that `apply(W, length, 0)` is closest to `(worldX, worldY)` along local +X
 * (first column of W); clamped to >= 0.
 */
export function boneLengthFromWorldPointer(W: Mat2D, worldX: number, worldY: number): number {
  const ox = W.e;
  const oy = W.f;
  const dx = W.a;
  const dy = W.b;
  const px = worldX - ox;
  const py = worldY - oy;
  const dd = dx * dx + dy * dy;
  if (dd < 1e-20) return 0;
  return Math.max(0, (px * dx + py * dy) / dd);
}

/**
 * Tip-drag style: distance from joint to pointer = bone length; bind rotation turns local +X toward the pointer.
 * Pass `previewBindPose` (usually same as bone.bindPose but with last frame’s preview rotation) so joint/tangent
 * stay consistent while dragging.
 */
export function boneLengthAndBindRotationFromWorldTip(
  project: EditorProject,
  boneId: string,
  worldX: number,
  worldY: number,
  previewBindPose?: Transform2D,
): { length: number; rotation: number } | null {
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  const local = previewBindPose ?? bone.bindPose;
  const mats = worldBindBoneMatricesOverridingBindPose(project, boneId, local);
  const W = mats.get(boneId);
  if (!W) return null;
  const J = apply(W, 0, 0);
  const dx = worldX - J.x;
  const dy = worldY - J.y;
  const L = Math.max(1e-6, Math.hypot(dx, dy));
  const tgt = Math.atan2(dy, dx);
  const cur = Math.atan2(W.b, W.a);
  let dr = tgt - cur;
  while (dr > Math.PI) dr -= 2 * Math.PI;
  while (dr < -Math.PI) dr += 2 * Math.PI;
  const rotation = local.rotation + dr;
  return { length: L, rotation };
}

/**
 * BindPose.x/y so setzen, dass der Knochen-Ursprung (lokales 0,0) an der Weltposition landet.
 * Rotation/Sx/Sy des Knochens bleiben unverändert (nur Translation).
 */
/**
 * Bind translation for a child so its joint sits at the parent's tip, in the same
 * **parent bone-local** space as `child.bindPose.x/y` (joint at 0,0; rest +X; tip at length,0).
 */
export function childBindTranslationAtParentTip(
  project: EditorProject,
  parentId: string,
): { x: number; y: number } | null {
  const parent = project.bones.find((b) => b.id === parentId);
  if (!parent) return null;
  return { x: parent.length, y: 0 };
}

export function localBindTranslationForWorldOrigin(
  project: EditorProject,
  boneId: string,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  if (bone.parentId === null) {
    return { x: worldX, y: worldY };
  }
  const world = worldBindBoneMatrices(project);
  const parentWorld = world.get(bone.parentId);
  if (!parentWorld) return null;
  const invP = invert(parentWorld);
  if (!invP) return null;
  const p = apply(invP, worldX, worldY);
  return { x: p.x, y: p.y };
}

/**
 * Parent chain from **pose at `time`** (not bind). Use when dragging in the main viewport to write
 * TX/TY keys so the joint moves to `(worldX, worldY)` at that time.
 */
export function localTranslationForWorldJointAtPoseTime(
  project: EditorProject,
  boneId: string,
  time: number,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  if (bone.parentId === null) {
    return { x: worldX, y: worldY };
  }
  const world = worldPoseBoneMatrices(project, time);
  const parentWorld = world.get(bone.parentId);
  if (!parentWorld) return null;
  const invP = invert(parentWorld);
  if (!invP) return null;
  const p = apply(invP, worldX, worldY);
  return { x: p.x, y: p.y };
}

/** World positions of bone origins at `time` using active clip. */
export function worldPoseOrigins(project: EditorProject, time: number): Map<string, { x: number; y: number }> {
  const world = worldPoseBoneMatrices(project, time);
  const origins = new Map<string, { x: number; y: number }>();
  for (const [id, m] of world) {
    origins.set(id, apply(m, 0, 0));
  }
  return origins;
}

export function clipDurationSeconds(clip: AnimationClip, _bones: Bone[]): number {
  let maxT = 0;
  for (const tr of clip.tracks) {
    for (const ch of tr.channels) {
      for (const k of ch.keys) maxT = Math.max(maxT, k.t);
    }
  }
  return Math.max(maxT, 1 / 60);
}
