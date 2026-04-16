import { apply, invert, type Mat2D } from "./mat2d.js";
import {
  worldBindBoneMatrices2D,
  worldBindBoneMatrices2DOverridingBindPose,
  worldBindBoneMatrices4,
  mat4ToMat2dProjection,
  worldPoseBoneMatrices2D,
  type GetLocalBoneStateOpts,
} from "./bone3dPose.js";
import { mat4Invert, transformPointMat4, type Mat4 } from "./mat4.js";
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
 * Pass `previewBindPose` (usually same as bone.bindPose but with last frame’s preview rotation) for `cur` (current
 * world angle of local +X). During live preview, pass `jointWorldFix` = world joint at pointer-down so length does
 * not use a pivot that moves when preview rotation changes (avoids jitter).
 *
 * **Child bones:** `rotation += tgt - cur` is wrong once the parent world matrix rotates the child axis: `cur` is a
 * world angle but `+dr` is applied in **local** space. We instead map the unit world direction into the parent’s
 * linear 2×2 inverse and take `atan2` there — same result as root when the parent is identity.
 */
export function boneLengthAndBindRotationFromWorldTip(
  project: EditorProject,
  boneId: string,
  worldX: number,
  worldY: number,
  previewBindPose?: Transform2D,
  jointWorldFix?: { x: number; y: number },
): { length: number; rotation: number } | null {
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  const local = previewBindPose ?? bone.bindPose;
  const mats = worldBindBoneMatricesOverridingBindPose(project, boneId, local);
  const W = mats.get(boneId);
  if (!W) return null;
  const J = jointWorldFix ?? apply(W, 0, 0);
  const dx = worldX - J.x;
  const dy = worldY - J.y;
  const L = Math.max(1e-6, Math.hypot(dx, dy));
  const tgt = Math.atan2(dy, dx);
  const wx = Math.cos(tgt);
  const wy = Math.sin(tgt);

  let rotation: number;
  if (bone.parentId === null) {
    const cur = Math.atan2(W.b, W.a);
    let dr = tgt - cur;
    while (dr > Math.PI) dr -= 2 * Math.PI;
    while (dr < -Math.PI) dr += 2 * Math.PI;
    rotation = local.rotation + dr;
  } else {
    const P = mats.get(bone.parentId);
    const det = P ? P.a * P.d - P.b * P.c : 0;
    if (!P || Math.abs(det) < 1e-14) {
      const cur = Math.atan2(W.b, W.a);
      let dr = tgt - cur;
      while (dr > Math.PI) dr -= 2 * Math.PI;
      while (dr < -Math.PI) dr += 2 * Math.PI;
      rotation = local.rotation + dr;
    } else {
      const invDet = 1 / det;
      const ia = P.d * invDet;
      const ib = -P.b * invDet;
      const ic = -P.c * invDet;
      const id = P.a * invDet;
      const hx = ia * wx + ic * wy;
      const hy = ib * wx + id * wy;
      rotation = Math.atan2(hy, hx);
    }
  }
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
  opts?: GetLocalBoneStateOpts,
): { x: number; y: number } | null {
  const bone = project.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  if (bone.parentId === null) {
    return { x: worldX, y: worldY };
  }
  const world = opts ? worldBindBoneMatrices2D(project, opts) : worldBindBoneMatrices(project);
  const parentWorld = world.get(bone.parentId);
  if (!parentWorld) return null;
  const invP = invert(parentWorld);
  if (!invP) return null;
  const p = apply(invP, worldX, worldY);
  return { x: p.x, y: p.y };
}

/**
 * Parent chain from **pose at `time`** (not bind). Use when dragging in the main viewport; the
 * command layer writes **translation offsets from bind** (`tx`/`ty` keys), not absolute locals.
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

/** Rigid rig slice: slice center in world → bone-local at bind (inverse bind matrix). */
export function boundSliceLocalInBindSpace(
  bindWorld: Mat2D,
  sliceWorldX: number,
  sliceWorldY: number,
): { lx: number; ly: number } | null {
  const inv = invert(bindWorld);
  if (!inv) return null;
  const p = apply(inv, sliceWorldX, sliceWorldY);
  return { lx: p.x, ly: p.y };
}

/** World center + in-plane rotation from bone +X at pose matrix. */
export function boundSliceWorldAtPose(
  poseWorld: Mat2D,
  localX: number,
  localY: number,
): { x: number; y: number; rotationRad: number } {
  const w = apply(poseWorld, localX, localY);
  return { x: w.x, y: w.y, rotationRad: Math.atan2(poseWorld.b, poseWorld.a) };
}

/** In-plane rotation for a canvas sprite from the posed bone’s local +X axis (XY). */
function sliceDrawRotationFromPose4(poseWorld4: Mat4): number {
  const o = transformPointMat4(poseWorld4, 0, 0, 0);
  const xp = transformPointMat4(poseWorld4, 1, 0, 0);
  return Math.atan2(xp.y - o.y, xp.x - o.x);
}

/**
 * Rigid character-rig slice in world space using full **4×4** bind/pose (ADR 0011).
 * Avoids singular / lossy 2×3 `mat4ToMat2dProjection` inverses when tilt/spin are used.
 * Slice position is purely `Wpose * inv(Wbind) * layout` (or stored local bind); IK is already
 * baked into `poseBoneM4` from {@link evaluatePose}.
 */
export function rigidCharacterRigSliceWorldPose(
  project: EditorProject,
  boneId: string,
  layoutWorldX: number,
  layoutWorldY: number,
  poseBoneM4: Map<string, Mat4>,
  opts?: {
    localX?: number;
    localY?: number;
    localZ?: number;
    rotOffset?: number;
    /** Must match how `poseBoneM4` was built (e.g. same `planar2dNoTiltSpin` as evaluatePose). */
    bindBoneOpts?: GetLocalBoneStateOpts;
  },
): { cx: number; cy: number; rot: number } | null {
  const Wbind4 = worldBindBoneMatrices4(project, opts?.bindBoneOpts).get(boneId);
  if (!Wbind4) return null;
  const Wpose4 = poseBoneM4.get(boneId);
  if (!Wpose4) return null;
  const invB = mat4Invert(Wbind4);
  let cx: number;
  let cy: number;
  let rot: number;
  if (!invB) {
    const B2 = mat4ToMat2dProjection(Wbind4);
    const P2 = mat4ToMat2dProjection(Wpose4);
    const loc =
      opts && opts.localX != null && opts.localY != null
        ? { lx: opts.localX, ly: opts.localY }
        : boundSliceLocalInBindSpace(B2, layoutWorldX, layoutWorldY);
    if (!loc) return null;
    const wp = boundSliceWorldAtPose(P2, loc.lx, loc.ly);
    cx = wp.x;
    cy = wp.y;
    const rotBind = Math.atan2(B2.b, B2.a);
    rot = wp.rotationRad - rotBind;
  } else {
    const local =
      opts && opts.localX != null && opts.localY != null
        ? { x: opts.localX, y: opts.localY, z: opts.localZ ?? 0 }
        : transformPointMat4(invB, layoutWorldX, layoutWorldY, 0);
    const wp = transformPointMat4(Wpose4, local.x, local.y, local.z);
    cx = wp.x;
    cy = wp.y;
    const rotPose = sliceDrawRotationFromPose4(Wpose4);
    const rotBind = sliceDrawRotationFromPose4(Wbind4);
    rot = rotPose - rotBind;
  }
  if (opts?.rotOffset) rot += opts.rotOffset;
  return { cx, cy, rot };
}

export function clipDurationSeconds(clip: AnimationClip, _bones: Bone[]): number {
  let maxT = 0;
  for (const tr of clip.tracks) {
    for (const ch of tr.channels) {
      for (const k of ch.keys) maxT = Math.max(maxT, k.t);
    }
  }
  for (const tr of clip.controlTracks ?? []) {
    for (const ch of tr.channels) {
      for (const k of ch.keys) maxT = Math.max(maxT, k.t);
    }
  }
  return Math.max(maxT, 1 / 60);
}
