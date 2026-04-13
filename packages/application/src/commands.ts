import {
  createId,
  type Bone,
  type ChannelProperty,
  type EditorProject,
  type Keyframe,
} from "@skelio/domain";

export type Command =
  | { type: "addBone"; parentId: string | null; name: string }
  | { type: "removeBone"; boneId: string }
  | { type: "renameBone"; boneId: string; name: string }
  | { type: "setBindPose"; boneId: string; partial: Partial<{ x: number; y: number; rotation: number; sx: number; sy: number }> }
  | { type: "setMetaName"; name: string }
  | { type: "setFps"; fps: number }
  | { type: "addKeyframe"; boneId: string; property: ChannelProperty; t: number; v: number }
  | { type: "removeKeyframe"; boneId: string; property: ChannelProperty; t: number };

function activeClip(project: EditorProject) {
  return project.clips.find((c) => c.id === project.activeClipId)!;
}

function insertSorted(keys: Keyframe[], k: Keyframe): Keyframe[] {
  const next = keys.filter((x) => Math.abs(x.t - k.t) > 1e-9);
  next.push(k);
  next.sort((a, b) => a.t - b.t);
  return next;
}

export function applyCommand(project: EditorProject, cmd: Command): EditorProject {
  const p: EditorProject = structuredClone(project);

  if (cmd.type === "setMetaName") {
    p.meta.name = cmd.name;
    return p;
  }
  if (cmd.type === "setFps") {
    p.meta.fps = Math.max(1, cmd.fps);
    return p;
  }

  if (cmd.type === "renameBone") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (b) b.name = cmd.name;
    return p;
  }

  if (cmd.type === "setBindPose") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (b) {
      Object.assign(b.bindPose, cmd.partial);
    }
    return p;
  }

  if (cmd.type === "addBone") {
    const id = createId("bone");
    const bone: Bone = {
      id,
      parentId: cmd.parentId,
      name: cmd.name,
      bindPose: { x: 40, y: 0, rotation: 0, sx: 1, sy: 1 },
    };
    p.bones.push(bone);
    return p;
  }

  if (cmd.type === "removeBone") {
    if (p.bones.length <= 1) return p;
    const victim = p.bones.find((x) => x.id === cmd.boneId);
    if (!victim || victim.parentId === null) return p;
    const parentOfVictim = victim.parentId;
    for (const c of p.bones) {
      if (c.parentId === cmd.boneId) c.parentId = parentOfVictim;
    }
    p.bones = p.bones.filter((x) => x.id !== cmd.boneId);
    const clip = activeClip(p);
    clip.tracks = clip.tracks.filter((t) => t.boneId !== cmd.boneId);
    return p;
  }

  if (cmd.type === "addKeyframe") {
    const clip = activeClip(p);
    let tr = clip.tracks.find((t) => t.boneId === cmd.boneId);
    if (!tr) {
      tr = { boneId: cmd.boneId, channels: [] };
      clip.tracks.push(tr);
    }
    let ch = tr.channels.find((c) => c.property === cmd.property);
    if (!ch) {
      ch = { property: cmd.property, interpolation: "linear", keys: [] };
      tr.channels.push(ch);
    }
    ch.keys = insertSorted(ch.keys, { t: cmd.t, v: cmd.v });
    return p;
  }

  if (cmd.type === "removeKeyframe") {
    const clip = activeClip(p);
    const tr = clip.tracks.find((t) => t.boneId === cmd.boneId);
    if (!tr) return p;
    const ch = tr.channels.find((c) => c.property === cmd.property);
    if (!ch) return p;
    ch.keys = ch.keys.filter((k) => Math.abs(k.t - cmd.t) > 1e-9);
    if (ch.keys.length === 0) {
      tr.channels = tr.channels.filter((c) => c.property !== cmd.property);
    }
    if (tr.channels.length === 0) {
      clip.tracks = clip.tracks.filter((t) => t.boneId !== cmd.boneId);
    }
    return p;
  }

  return p;
}
