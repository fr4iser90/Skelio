export {
  ASSETS_DIRECTORY_NAME,
  PROJECT_MANIFEST_FILE,
  RUNTIME_SCHEMA_VERSION,
} from "./constants.js";
export type {
  AnimationClip,
  Bone,
  BoneBind3d,
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
  worldBindBoneMatricesOverridingBindPose,
  worldBindOrigins,
  worldBindBoneTips,
  worldBindBoneTipForLengthHit,
  BONE_LENGTH_HIT_MIN_LOCAL,
  worldPoseBoneMatrices,
  worldPoseOrigins,
  worldPoseBoneTips,
  clipDurationSeconds,
  localBindTranslationForWorldOrigin,
  localTranslationForWorldJointAtPoseTime,
  boneLengthFromWorldPointer,
  boneLengthAndBindRotationFromWorldTip,
  childBindTranslationAtParentTip,
} from "./editor/pose.js";
export {
  getBindLocalBoneState,
  getLocalBoneState,
  localMat4FromState,
  mat4ToMat2dProjection,
  worldBindBoneMatrices4,
  worldPoseBoneMatrices4,
} from "./editor/bone3dPose.js";
export { mat4Identity, mat4Multiply, mat4Translate, mat4RotateZ, mat4RotateX, mat4RotateY } from "./editor/mat4.js";
export {
  fabrik2dThreeJoints,
  segmentLengthsFromBindOrigins,
  segmentLengthsFromBoneFields,
} from "./editor/ik2d.js";
export { worldPoseOriginsWithIk } from "./editor/ikPose.js";
export { deformSkinnedMesh, validateSkinnedMesh } from "./editor/skinning.js";
export { createDemoSkinnedMesh } from "./editor/demoMesh.js";
export {
  characterRigBindingsComplete,
  RIG_SLICE_MESH_ID_PREFIX,
  rigSliceSkinnedMeshId,
  skinnedMeshesFromCharacterRig,
} from "./editor/characterRigMesh.js";
export {
  DEFAULT_RIG_SLICE_DEPTH_ON_MESH_SYNC,
  ensureMinimalSliceDepthOnMeshSync,
} from "./editor/characterRigDepthSeed.js";
export { meshDisplayNameFromFileName, skinnedMeshFromObjText } from "./editor/objImport.js";
export {
  editorProjectToRuntime,
  type RuntimeExport,
  type RuntimeSkinnedMesh,
} from "./editor/runtimeExport.js";
export { createDefaultEditorProject } from "./editor/projectFactory.js";
export { normalizeEditorProjectInPlace } from "./editor/migrate.js";
