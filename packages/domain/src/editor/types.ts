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

/**
 * Two-link IK chain (three joints): `root` → `mid` → `tip` must be a strict parent chain.
 * Spike: FABRIK on joint positions; viewport origins only (mesh still FK).
 */
export type IkTwoBoneChain = {
  id: string;
  name: string;
  enabled: boolean;
  rootBoneId: string;
  midBoneId: string;
  tipBoneId: string;
  targetX: number;
  targetY: number;
};

/** Embedded reference art (viewport); not part of runtime export. */
export type EditorReferenceImage = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

/** One bone influence on a vertex (linear blend skinning). */
export type SkinInfluence = { boneId: string; weight: number };

/**
 * 2D mesh in bind space (same plane as the armature), triangulated.
 * `influences[i]` matches `vertices[i]`.
 */
export type SkinnedMesh = {
  id: string;
  name: string;
  /** Geometry in separate file under `assets/meshes/` when using folder project on disk. */
  assetPath?: string;
  vertices: { x: number; y: number }[];
  /** Triangle list (length multiple of 3). */
  indices: number[];
  influences: SkinInfluence[][];
};

export type EditorProject = {
  editorSchemaVersion: "1.0.0";
  meta: EditorMeta;
  bones: Bone[];
  clips: AnimationClip[];
  /** Clip edited in timeline */
  activeClipId: string;
  /** Optional rotoscope / layout image (PNG, JPEG, WebP). */
  referenceImage?: EditorReferenceImage | null;
  /** Skinned triangle meshes (editor + viewport; runtime export optional later). */
  skinnedMeshes?: SkinnedMesh[];
  /** Optional IK chains (editor / viewport spike; not in runtime export). */
  ikTwoBoneChains?: IkTwoBoneChain[];
};
