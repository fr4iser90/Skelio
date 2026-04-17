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
  ControlChannel,
  ControlChannelProperty,
  ControlTrack,
  CharacterRigBinding,
  CharacterRigConfig,
  CharacterRigSliceDepth,
  CharacterRigSliceEmbeddedImage,
  CharacterRigSpriteSheetEntry,
  CharacterRigSpriteSlice,
  CharacterSlot,
  EditorRig,
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
export { rotationOnly2d } from "./editor/mat2d.js";
export type { Mat4 } from "./editor/mat4.js";
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
  poseBoneRotationTowardWorldPoint,
  childBindTranslationAtParentTip,
  boundSliceLocalInBindSpace,
  boundSliceWorldAtPose,
  rigidCharacterRigSliceWorldPose,
} from "./editor/pose.js";
export {
  getBindLocalBoneState,
  getLocalBoneState,
  type GetLocalBoneStateOpts,
  localMat4FromState,
  worldBindBoneMatrices4,
  worldBindBoneMatrices4OverridingBindPose,
  worldPoseBoneMatrices4,
  worldPoseBoneMatrices4WithRotOverrides,
} from "./editor/bone3dPose.js";
export {
  planar2dClosedFkChainOpts,
  mat4ToMat2dProjection,
  worldBindBoneMatrices2D,
  worldBindBoneMatrices2DOverridingBindPose,
  worldPoseBoneMatrices2D,
  worldPoseBoneMatrices2DWithRotOverrides,
} from "./editor/bone2dPose.js";
export {
  mat4Identity,
  mat4Invert,
  mat4Multiply,
  transformPointMat4,
  mat4Translate,
  mat4RotateZ,
  mat4RotateX,
  mat4RotateY,
} from "./editor/mat4.js";
export {
  fabrik2dChain,
  fabrik2dThreeJoints,
  segmentLengthsFromBindOrigins,
  segmentLengthsFromBoneFields,
} from "./editor/ik2d.js";
export {
  getFabrikIkChainById,
  getFabrikIkChains,
  getTwoBoneIkChains,
  setTwoBoneIkChains,
} from "./editor/rig/accessors.js";
export { sampleIkTargetOverride2d, sampleControlChannel } from "./editor/rig/controls.js";
export {
  solveTwoBoneChain2dAtTime,
  getTwoBoneChainById,
  twoBoneIkAbsoluteLocalRotsAtTime,
  type PoseMatsCache,
  type SolvedTwoBoneChain2d,
} from "./editor/rig/solveTwoBoneChain2d.js";
export {
  fabrikIkAbsoluteLocalRotsAtTime,
  validateFabrikBoneChain,
} from "./editor/rig/solveFabrikPlanarChain2d.js";
export { evaluatePose } from "./editor/rig/evaluatePose.js";
export type { PoseState, EvaluatePoseOptions } from "./editor/rig/types.js";
export { solveTwoBoneIk2d } from "./editor/rig/ik2bone2d.js";
export { bakeIkTwoBoneChainRotKeysAtTime, type BakeIkToFkRotKeys } from "./editor/rig/bakeIkToFk.js";
export { deformSkinnedMesh, validateSkinnedMesh } from "./editor/skinning.js";
export { createDemoSkinnedMesh } from "./editor/demoMesh.js";
export {
  characterRigBindingsComplete,
  characterRigBindingsCompleteStrict,
  RIG_SLICE_MESH_ID_PREFIX,
  rigSliceSkinnedMeshId,
  resolveCharacterRigSliceBoundBoneId,
  skinnedMeshesFromCharacterRig,
} from "./editor/characterRigMesh.js";
export {
  allCharacterRigSlices,
  allCharacterRigSpriteSheets,
  boneIdsInCharacterSubtree,
  ensureCharacterRigForProject,
  findCharacterRigBinding,
  findSliceDepthEntry,
  findSliceInCharacterRigs,
  getCharacterRig,
  iterCharacterRigs,
  resolveDefaultCharacterId,
} from "./editor/characterSlots.js";
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
