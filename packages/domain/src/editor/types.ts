/** Editor-side model (not identical to runtime JSON). */

export type Transform2D = {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
};

export type Bone = {
  id: string;
  parentId: string | null;
  name: string;
  bindPose: Transform2D;
};

export type Keyframe = { t: number; v: number };

export type ChannelProperty = "tx" | "ty" | "rot";

export type Channel = {
  property: ChannelProperty;
  interpolation: "linear" | "hold";
  keys: Keyframe[];
};

export type Track = {
  boneId: string;
  channels: Channel[];
};

export type AnimationClip = {
  id: string;
  name: string;
  tracks: Track[];
};

export type EditorMeta = {
  name: string;
  fps: number;
};

export type EditorProject = {
  editorSchemaVersion: "1.0.0";
  meta: EditorMeta;
  bones: Bone[];
  clips: AnimationClip[];
  /** Clip edited in timeline */
  activeClipId: string;
};
