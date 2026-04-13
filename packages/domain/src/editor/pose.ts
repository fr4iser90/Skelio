import type { AnimationClip, Bone, EditorProject, Transform2D } from "./types.js";

type Mat2D = { a: number; b: number; c: number; d: number; e: number; f: number };

function multiply(m: Mat2D, n: Mat2D): Mat2D {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function fromTransform(t: Transform2D): Mat2D {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    a: cos * t.sx,
    b: sin * t.sx,
    c: -sin * t.sy,
    d: cos * t.sy,
    e: t.x,
    f: t.y,
  };
}

function apply(m: Mat2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** World bind-pose origins (bone tail at origin of child space = 0,0 in local). */
export function worldBindOrigins(project: EditorProject): Map<string, { x: number; y: number }> {
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  const world = new Map<string, Mat2D>();

  const visit = (id: string, parentWorld: Mat2D | null) => {
    const b = byId.get(id)!;
    const local = fromTransform(b.bindPose);
    const w = parentWorld === null ? local : multiply(parentWorld, local);
    world.set(id, w);
    for (const c of project.bones) {
      if (c.parentId === id) visit(c.id, w);
    }
  };

  const roots = project.bones.filter((b) => b.parentId === null);
  for (const r of roots) visit(r.id, null);

  const origins = new Map<string, { x: number; y: number }>();
  for (const [id, m] of world) {
    origins.set(id, apply(m, 0, 0));
  }
  return origins;
}

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

function localTransformAtTime(
  bone: Bone,
  clip: AnimationClip | undefined,
  time: number,
): Transform2D {
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

/** World positions of bone origins at `time` using active clip. */
export function worldPoseOrigins(project: EditorProject, time: number): Map<string, { x: number; y: number }> {
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  const world = new Map<string, Mat2D>();

  const visit = (id: string, parentWorld: Mat2D | null) => {
    const b = byId.get(id)!;
    const local = fromTransform(localTransformAtTime(b, clip, time));
    const w = parentWorld === null ? local : multiply(parentWorld, local);
    world.set(id, w);
    for (const c of project.bones) {
      if (c.parentId === id) visit(c.id, w);
    }
  };

  const roots = project.bones.filter((b) => b.parentId === null);
  for (const r of roots) visit(r.id, null);

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
