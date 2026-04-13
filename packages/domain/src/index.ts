export {
  ASSETS_DIRECTORY_NAME,
  PROJECT_MANIFEST_FILE,
  RUNTIME_SCHEMA_VERSION,
} from "./constants.js";
export type {
  AnimationClip,
  Bone,
  Channel,
  ChannelProperty,
  CharacterRigBinding,
  CharacterRigConfig,
  CharacterRigSliceDepth,
  CharacterRigSliceEmbeddedImage,
  CharacterRigSpriteSheetEntry,
  CharacterRigSpriteSlice,
  EditorMeta,
  EditorProject,
  EditorReferenceImage,
  IkTwoBoneChain,
  Keyframe,
  SkinInfluence,
  SkinnedMesh,
  Track,
  Transform2D,
} from "./editor/types.js";
export { addBoneWeightDelta, normalizeInfluenceRow, sanitizeInfluenceRow } from "./editor/influences.js";
export {
  dehydrateEditorProjectForFolder,
  hydrateEditorProjectFromFolder,
  meshAssetRelativePath,
  parseMeshPayload,
  serializeMeshPayload,
  SKELIO_MESH_FORMAT,
  stripMeshAssetPaths,
  type MeshPayloadV1,
} from "./editor/meshAsset.js";
export {
  REFERENCE_IMAGE_ACCEPT_ATTR,
  mimeFromFileName,
  normalizeReferenceImageMime,
} from "./editor/referenceImage.js";
export { createId } from "./editor/ids.js";
export { validateEditorProject, type ValidationIssue } from "./editor/validate.js";
export type { Mat2D } from "./editor/mat2d.js";
export {
  worldBindBoneMatrices,
  worldBindOrigins,
  worldPoseBoneMatrices,
  worldPoseOrigins,
  clipDurationSeconds,
  localBindTranslationForWorldOrigin,
} from "./editor/pose.js";
export { fabrik2dThreeJoints, segmentLengthsFromBindOrigins } from "./editor/ik2d.js";
export { worldPoseOriginsWithIk } from "./editor/ikPose.js";
export { deformSkinnedMesh, validateSkinnedMesh } from "./editor/skinning.js";
export { createDemoSkinnedMesh } from "./editor/demoMesh.js";
export { meshDisplayNameFromFileName, skinnedMeshFromObjText } from "./editor/objImport.js";
export {
  editorProjectToRuntime,
  type RuntimeExport,
  type RuntimeSkinnedMesh,
} from "./editor/runtimeExport.js";
export { createDefaultEditorProject } from "./editor/projectFactory.js";
export { normalizeEditorProjectInPlace } from "./editor/migrate.js";
