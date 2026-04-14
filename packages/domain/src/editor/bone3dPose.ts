import type { Mat2D } from "./mat2d.js";
import {
  mat4Multiply,
  mat4RotateX,
  mat4RotateY,
  mat4RotateZ,
  mat4Scale,
  mat4Translate,
  transformPointMat4,
  type Mat4,
} from "./mat4.js";
import type { AnimationClip, Bone, EditorProject, Transform2D } from "./types.js";

export type LocalBoneState = {
  x: number;
  y: number;
  z: number;
  rot: number;
  tilt: number;
  spin: number;
  sx: number;
  sy: number;
};

function sampleChannel(keys: { t: number; v: number }[], t: number, fallback: number): number {
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

/** Pose + clips: full local state including Z / tilt / spin. */
export function getLocalBoneState(bone: Bone, clip: AnimationClip | undefined, time: number): LocalBoneState {
  const tr = clip?.tracks.find((x) => x.boneId === bone.id);
  const bp = bone.bindPose;
  const b3 = bone.bindBone3d;
  const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
  let x = bp.x;
  let y = bp.y;
  let z = zBase;
  let rot = bp.rotation;
  let tilt = b3?.tilt ?? 0;
  let spin = b3?.spin ?? 0;
  if (tr) {
    for (const ch of tr.channels) {
      if (ch.property === "tx") x = sampleChannel(ch.keys, time, bp.x);
      if (ch.property === "ty") y = sampleChannel(ch.keys, time, bp.y);
      if (ch.property === "tz") z = sampleChannel(ch.keys, time, zBase);
      if (ch.property === "rot") rot = sampleChannel(ch.keys, time, bp.rotation);
      if (ch.property === "tilt") tilt = sampleChannel(ch.keys, time, b3?.tilt ?? 0);
      if (ch.property === "spin") spin = sampleChannel(ch.keys, time, b3?.spin ?? 0);
    }
  }
  return { x, y, z, rot, tilt, spin, sx: bp.sx, sy: bp.sy };
}

/** Bind-only local state (no animation). Optional 2D bind override for one bone (tip-drag preview). */
export function getBindLocalBoneState(
  bone: Bone,
  overrideBoneId: string | null,
  bindPoseOverride: Transform2D | null,
): LocalBoneState {
  const bp = bone.bindPose;
  const b3 = bone.bindBone3d;
  const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
  if (overrideBoneId && bone.id === overrideBoneId && bindPoseOverride) {
    return {
      x: bindPoseOverride.x,
      y: bindPoseOverride.y,
      z: zBase,
      rot: bindPoseOverride.rotation,
      tilt: b3?.tilt ?? 0,
      spin: b3?.spin ?? 0,
      sx: bindPoseOverride.sx,
      sy: bindPoseOverride.sy,
    };
  }
  return {
    x: bp.x,
    y: bp.y,
    z: zBase,
    rot: bp.rotation,
    tilt: b3?.tilt ?? 0,
    spin: b3?.spin ?? 0,
    sx: bp.sx,
    sy: bp.sy,
  };
}

/** T * Rz * Rx * Ry * S — siehe ADR 0011. */
export function localMat4FromState(s: LocalBoneState): Mat4 {
  const T = mat4Translate(s.x, s.y, s.z);
  const RZ = mat4RotateZ(s.rot);
  const RX = mat4RotateX(s.tilt);
  const RY = mat4RotateY(s.spin);
  const S = mat4Scale(s.sx, s.sy, 1);
  return mat4Multiply(T, mat4Multiply(RZ, mat4Multiply(RX, mat4Multiply(RY, S))));
}

/** XY-Projektion der oberen 2×2 + Translation für bestehendes 2D-Skinning. */
export function mat4ToMat2dProjection(m: Mat4): Mat2D {
  return {
    a: m[0],
    b: m[1],
    c: m[4],
    d: m[5],
    e: m[12],
    f: m[13],
  };
}

function worldMat4sFromLocals(
  project: EditorProject,
  getLocal: (b: Bone) => LocalBoneState,
): Map<string, Mat4> {
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  const world = new Map<string, Mat4>();

  const visit = (id: string, parentWorld: Mat4 | null) => {
    const b = byId.get(id)!;
    const local = localMat4FromState(getLocal(b));
    const w = parentWorld === null ? local : mat4Multiply(parentWorld, local);
    world.set(id, w);
    for (const c of project.bones) {
      if (c.parentId === id) visit(c.id, w);
    }
  };

  const roots = project.bones.filter((b) => b.parentId === null);
  for (const r of roots) visit(r.id, null);
  return world;
}

export function worldBindBoneMatrices4(project: EditorProject): Map<string, Mat4> {
  return worldMat4sFromLocals(project, (b) => getBindLocalBoneState(b, null, null));
}

export function worldBindBoneMatrices4OverridingBindPose(
  project: EditorProject,
  boneId: string,
  bindPoseOverride: Transform2D,
): Map<string, Mat4> {
  return worldMat4sFromLocals(project, (b) => getBindLocalBoneState(b, boneId, bindPoseOverride));
}

export function worldPoseBoneMatrices4(project: EditorProject, time: number): Map<string, Mat4> {
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  return worldMat4sFromLocals(project, (b) => getLocalBoneState(b, clip, time));
}

export function worldPoseBoneMatrices2D(project: EditorProject, time: number): Map<string, Mat2D> {
  const m4 = worldPoseBoneMatrices4(project, time);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) {
    out.set(id, mat4ToMat2dProjection(m));
  }
  return out;
}

export function worldBindBoneMatrices2D(project: EditorProject): Map<string, Mat2D> {
  const m4 = worldBindBoneMatrices4(project);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) {
    out.set(id, mat4ToMat2dProjection(m));
  }
  return out;
}

export function worldBindBoneMatrices2DOverridingBindPose(
  project: EditorProject,
  boneId: string,
  bindPoseOverride: Transform2D,
): Map<string, Mat2D> {
  const m4 = worldBindBoneMatrices4OverridingBindPose(project, boneId, bindPoseOverride);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) {
    out.set(id, mat4ToMat2dProjection(m));
  }
  return out;
}

export function worldOriginFromMat4(m: Mat4): { x: number; y: number } {
  return { x: m[12], y: m[13] };
}

export function worldTipFromMat4(m: Mat4, length: number): { x: number; y: number } {
  const p = transformPointMat4(m, length, 0, 0);
  return { x: p.x, y: p.y };
}
