/** Editor-side model (not identical to runtime JSON). */

export type Transform2D = {
  x: number;
  y: number;
  rotation: number;
  sx: number;
  sy: number;
};

/**
 * Optional 3D bind (editor; see docs/adr/0011-editor-bone-3d-bind-pose.md).
 * `z` + `depthOffset` sum to the local Z translation before rotations.
 */
export type BoneBind3d = {
  z: number;
  depthOffset: number;
  tilt: number;
  spin: number;
};

export type Bone = {
  id: string;
  parentId: string | null;
  name: string;
  bindPose: Transform2D;
  /** Rest length along local +X (after bindPose translation), world tip = matrix · (length, 0). */
  length: number;
  /** Editor-only: keep bind X/Y at parent tip when parent bind/length changes. */
  followParentTip?: boolean;
  /** Editor-only: Z / tilt / spin (radians). Omitted = all zero. */
  bindBone3d?: BoneBind3d;
};

export type Keyframe = { t: number; v: number };

export type ChannelProperty = "tx" | "ty" | "tz" | "rot" | "tilt" | "spin";

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
  /**
   * When true (default for new projects), clip channel values for tx/ty/tz/rot/tilt/spin are
   * **offsets from the bone’s bind pose** at key time. Omitted/false: legacy absolute values;
   * `normalizeEditorProjectInPlace` converts once and sets this to true.
   */
  clipTransformsRelativeToBind?: boolean;
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

/** Per-slice image data when no global sprite sheet is used. */
export type CharacterRigSliceEmbeddedImage = {
  mimeType: string;
  dataBase64: string;
  pixelWidth: number;
  pixelHeight: number;
};

/** Grayscale depth/height texture per slice side (editor-only; not in runtime export yet). */
export type CharacterRigSliceDepthTexture = {
  mimeType: string;
  dataBase64: string;
  pixelWidth: number;
  pixelHeight: number;
};

/**
 * Imported texture page (right-hand “sprite sheets” in Character Rig).
 */
export type CharacterRigSpriteSheetEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
  pixelWidth?: number;
  pixelHeight?: number;
};

/**
 * One sprite **slot** (left list): can be empty (0×0) until a region is picked from a sheet.
 * Pixels: `embedded` **or** rect in `spriteSheets` via `sheetId` + x,y,width,height.
 */
export type CharacterRigSpriteSlice = {
  id: string;
  name: string;
  /** Pixel rect inside `sheetId` image (ignored when embedded or empty slot). */
  x: number;
  y: number;
  width: number;
  height: number;
  worldCx: number;
  worldCy: number;
  /** Body-facing metadata for this part (editor; 2D preview still uses front pixels / back layer). */
  side?: "front" | "back";
  /** Which sheet the rect refers to (when not embedded). */
  sheetId?: string;
  /** Inline pixels for this part (front). Mutually exclusive with `sheetId` when set. */
  embedded?: CharacterRigSliceEmbeddedImage;
  /** Optional back-side pixels (same dimensions as slice width/height). Editor / 3D back face. */
  embeddedBack?: CharacterRigSliceEmbeddedImage;
};

/** Maps a slice to a bone. */
export type CharacterRigBinding = {
  sliceId: string;
  boneId: string;
  /**
   * Optional bind-time local attachment point (bone local space).
   * When present, binding a slice to a bone should NOT change the slice’s current world placement:
   * we store the local coordinates that reproduce the current `worldCx/worldCy` at bind pose.
   */
  localX?: number;
  localY?: number;
  localZ?: number;
  /**
   * Optional rotation offset (radians) added on top of the bone’s in-plane rotation.
   * Used to keep sprite orientation stable at bind time and/or compensate atlas orientation.
   */
  rotOffset?: number;
};

/** Optional 2.5D depth per slice (editor spike; not in runtime export yet). */
export type CharacterRigSliceDepth = {
  sliceId: string;
  maxDepthFront: number;
  maxDepthBack: number;
  syncBackWithFront: boolean;
  /** Optional depth/height texture for front side (0..1 mapped to maxDepthFront). */
  depthTextureFront?: CharacterRigSliceDepthTexture;
  /** Optional depth/height texture for back side (0..1 mapped to maxDepthBack). */
  depthTextureBack?: CharacterRigSliceDepthTexture;
};

/**
 * Character builder: sprite sheets (assets) + part slots + bindings + optional depth.
 * Legacy `spriteSheet` is migrated to `spriteSheets` in normalizeEditorProjectInPlace.
 */
export type CharacterRigConfig = {
  /** @deprecated Use `spriteSheets`; removed after migrate. */
  spriteSheet?: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
    pixelWidth?: number;
    pixelHeight?: number;
  } | null;
  spriteSheets: CharacterRigSpriteSheetEntry[];
  slices: CharacterRigSpriteSlice[];
  bindings: CharacterRigBinding[];
  sliceDepths: CharacterRigSliceDepth[];
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
  /** Optional Character rig (sheet, slices, bindings). */
  characterRig?: CharacterRigConfig;
};
