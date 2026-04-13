import { apply, fromTransform, invert, multiply, type Mat2D } from "./mat2d.js";
import type { AnimationClip, Bone, EditorProject, Transform2D } from "./types.js";

function sampleChannel(
  keys: { t: number; v: number }[],
  t: number,
  fallback: number,
): number {
  if (keys.length === 0) return fallback;
  if (t <= keys[0]!.t) return keys[0]!.v;
  if (t >= keys[keys.length - 1]!.t) return keys[keys.length - 1]!.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i]!;
    const k1 = keys[i + 1]!;
    if (t >= k0.t && t <= k1.t) {
      const u = (t - k0.t) / (k1.t - k0.t || 1e-9);
      return k0.v + u * (k1.v - k0.v);
    }
  }
  return fallback;
}

function localTransformAtTime(bone: Bone, clip: AnimationClip | undefined, time: number): Transform2D {
  const tr = clip?.tracks.find((x) => x.boneId === bone.id);
  const bp = bone.bindPose;
  if (!tr) return { ...bp };
  let x = bp.x;
  let y = bp.y;
  let rot = bp.rotation;
  for (const ch of tr.channels) {
    if (ch.property === "tx") x = sampleChannel(ch.keys, time, bp.x);
    if (ch.property === "ty") y = sampleChannel(ch.keys, time, bp.y);
    if (ch.property === "rot") rot = sampleChannel(ch.keys, time, bp.rotation);
  }
  return { x, y, rotation: rot, sx: bp.sx, sy: bp.sy };
}

function worldMatricesFromLocals(project: EditorProject, getLocal: (b: Bone) => Transform2D): Map<string, Mat2D> {
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  const world = new Map<string, Mat2D>();

  const visit = (id: string, parentWorld: Mat2D | null) => {
    const b = byId.get(id)!;
    const local = fromTransform(getLocal(b));
    const w = parentWorld === null ? local : multiply(parentWorld, local);
    world.set(id, w);
    for (const c of project.bones) {
      if (c.parentId === id) visit(c.id, w);
    }
  };

  const roots = project.bones.filter((b) => b.parentId === null);
  for (const r of roots) visit(r.id, null);
  return world;
}

/** World bone matrices in bind pose (no animation). */
export function worldBindBoneMatrices(project: EditorProject): Map<string, Mat2D> {
  return worldMatricesFromLocals(project, (b) => b.bindPose);
}

/** World bone matrices at animation time `time` (active clip). */
export function worldPoseBoneMatrices(project: EditorProject, time: number): Map<string, Mat2D> {
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  return worldMatricesFromLocals(project, (b) => localTransformAtTime(b, clip, time));
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

/**
 * BindPose.x/y so setzen, dass der Knochen-Ursprung (lokales 0,0) an der Weltposition landet.
 * Rotation/Sx/Sy des Knochens bleiben unverändert (nur Translation).
 */
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
