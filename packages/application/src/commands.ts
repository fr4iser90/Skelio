import {
  childBindTranslationAtParentTip,
  createDemoSkinnedMesh,
  createId,
  bakeIkTwoBoneChainRotKeysAtTime,
  ensureMinimalSliceDepthOnMeshSync,
  ensureCharacterRigForProject,
  getCharacterRig,
  getFabrikIkChainById,
  mat4Invert,
  normalizeReferenceImageMime,
  RIG_SLICE_MESH_ID_PREFIX,
  sanitizeInfluenceRow,
  worldBindBoneMatrices4,
  worldBindBoneTips,
  skinnedMeshesFromCharacterRig,
  transformPointMat4,
  validateSkinnedMesh,
  type Bone,
  type BoneBind3d,
  type ChannelProperty,
  type CharacterRigConfig,
  type CharacterRigSliceEmbeddedImage,
  type AnimationClip,
  type EditorProject,
  type Keyframe,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";

/** Rig-related commands accept optional `characterId` (defaults to first slot). */
export type Command = (
  | { type: "addBone"; parentId: string | null; name: string; placeAtParentTip?: boolean }
  | { type: "removeBone"; boneId: string }
  | { type: "renameBone"; boneId: string; name: string }
  | { type: "setBindPose"; boneId: string; partial: Partial<{ x: number; y: number; rotation: number; sx: number; sy: number }> }
  | { type: "setBindBone3d"; boneId: string; partial: Partial<BoneBind3d> }
  | { type: "setBoneLength"; boneId: string; length: number }
  | { type: "setBoneLengthAndBindRotation"; boneId: string; length: number; rotation: number }
  | { type: "snapBoneToParentTip"; boneId: string }
  | { type: "setBoneFollowParentTip"; boneId: string; follow: boolean }
  | { type: "setMetaName"; name: string }
  | { type: "setFps"; fps: number }
  | { type: "addKeyframe"; boneId: string; property: ChannelProperty; t: number; v: number }
  | { type: "removeKeyframe"; boneId: string; property: ChannelProperty; t: number }
  /**
   * Removes all `tx` / `ty` / `rot` keys near `t` on every track of the active clip (±1e-4 s).
   * Sampling then falls back to bind pose — fixes accidental `0` keys that collapse rigs whose bind
   * translations are non-zero.
   */
  | { type: "purgeClipTranslationRotationKeysAtTime"; t: number }
  | { type: "setReferenceImage"; fileName: string; mimeType: string; dataBase64: string }
  | { type: "clearReferenceImage" }
  | { type: "addDemoSkinnedMesh" }
  | { type: "clearSkinnedMeshes" }
  | { type: "addSkinnedMesh"; mesh: SkinnedMesh }
  | { type: "setMeshVertexInfluences"; meshId: string; vertexIndex: number; influences: SkinInfluence[] }
  | { type: "setMeshVerticesInfluences"; meshId: string; updates: { vertexIndex: number; influences: SkinInfluence[] }[] }
  | { type: "addDemoIkChain" }
  | { type: "addTwoBoneIkChainFromTip"; tipBoneId: string; name: string; allowStretch?: boolean }
  | { type: "setIkChainTarget"; chainId: string; targetX: number; targetY: number }
  | { type: "setIkChainEnabled"; chainId: string; enabled: boolean }
  | { type: "removeIkChain"; chainId: string }
  | { type: "addFabrikIkChainFromTip"; tipBoneId: string; name: string; maxBones?: number }
  | { type: "setFabrikIkChainTarget"; chainId: string; targetX: number; targetY: number }
  | { type: "setFabrikIkChainEnabled"; chainId: string; enabled: boolean }
  | { type: "removeFabrikIkChain"; chainId: string }
  | { type: "bakeIkToFk"; chainId: string; sampleTimes: number[] }
  | { type: "ensureIkTargetControl"; chainId: string }
  | { type: "setIkTargetControlEnabled"; controlId: string; enabled: boolean }
  | { type: "setIkTargetControlBase"; controlId: string; x: number; y: number; poleX?: number; poleY?: number }
  | { type: "addIkTargetControlKeyframe"; controlId: string; property: "x" | "y" | "poleX" | "poleY"; t: number; v: number }
  | {
      type: "setCharacterRigSpriteSheet";
      fileName: string;
      mimeType: string;
      dataBase64: string;
      pixelWidth?: number;
      pixelHeight?: number;
    }
  | {
      type: "addCharacterRigSpriteSheet";
      fileName: string;
      mimeType: string;
      dataBase64: string;
      pixelWidth?: number;
      pixelHeight?: number;
    }
  | { type: "removeCharacterRigSpriteSheet"; sheetId: string }
  | { type: "clearCharacterRigSpriteSheet" }
  | { type: "clearCharacterRig" }
  | { type: "addCharacterRigEmptyPart" }
  | {
      type: "assignCharacterRigSliceFromSheetRegion";
      sliceId: string;
      sheetId: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "addCharacterRigSlice";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      worldCx?: number;
      worldCy?: number;
      sheetId?: string;
    }
  | {
      type: "addCharacterRigImportedSprite";
      name: string;
      mimeType: string;
      dataBase64: string;
      pixelWidth: number;
      pixelHeight: number;
      worldCx?: number;
      worldCy?: number;
    }
  | { type: "setCharacterRigSliceWorldPosition"; sliceId: string; worldCx: number; worldCy: number }
  | {
      type: "patchCharacterRigSlice";
      sliceId: string;
      name?: string;
      side?: "front" | "back";
    }
  | { type: "renameCharacterRigSlice"; sliceId: string; name: string }
  | { type: "removeCharacterRigSlice"; sliceId: string }
  /** `insertBeforeSliceId === null` = ans Ende der Liste (zuletzt gezeichnet = weiter vorne). */
  | { type: "reorderCharacterRigSlice"; sliceId: string; insertBeforeSliceId: string | null }
  | { type: "setCharacterRigBinding"; sliceId: string; boneId: string }
  | { type: "clearCharacterRigBinding"; sliceId: string }
  | {
      type: "setCharacterRigSliceDepth";
      sliceId: string;
      maxDepthFront: number;
      maxDepthBack: number;
      syncBackWithFront: boolean;
    }
  | {
      type: "setCharacterRigSliceDepthTexture";
      sliceId: string;
      side: "front" | "back";
      mimeType: string;
      dataBase64: string;
      pixelWidth: number;
      pixelHeight: number;
    }
  | { type: "clearCharacterRigSliceDepthTexture"; sliceId: string; side: "front" | "back" }
  /** Replaces auto-generated rig meshes (`rig_slice_*`) from bound slices + depths; keeps other meshes. */
  | { type: "syncCharacterRigSkinnedMeshes" }
  /** Inline pixels for front or back; dimensions must match slice width/height. */
  | {
      type: "setCharacterRigSliceLayerPixels";
      sliceId: string;
      layer: "front" | "back";
      image: CharacterRigSliceEmbeddedImage;
    }
  /** Remove optional back-side pixels. */
  | { type: "clearCharacterRigSliceEmbeddedBack"; sliceId: string }
  /** Bake sheet rect into embedded front (drops sheet reference). */
  | { type: "promoteCharacterRigSliceToEmbedded"; sliceId: string; image: CharacterRigSliceEmbeddedImage }
  /** TX/TY keys at `t` in one step (single undo) — main-view bone drag animation. */
  | { type: "setBoneTranslationKeysAtTime"; boneId: string; t: number; x: number; y: number }
  | { type: "addAnimationClip"; name: string }
  | { type: "removeAnimationClip"; clipId: string }
  | { type: "renameAnimationClip"; clipId: string; name: string }
  | { type: "duplicateAnimationClip"; clipId: string }
  | { type: "setActiveClip"; clipId: string }
  | { type: "importAnimationClip"; clip: AnimationClip }
  | { type: "addCharacter"; name: string }
  | { type: "renameCharacterSlot"; characterId: string; name: string }
) & { characterId?: string };

const CHARACTER_RIG_COMMAND_TYPES = new Set<string>([
  "setCharacterRigSpriteSheet",
  "addCharacterRigSpriteSheet",
  "removeCharacterRigSpriteSheet",
  "clearCharacterRigSpriteSheet",
  "clearCharacterRig",
  "addCharacterRigEmptyPart",
  "assignCharacterRigSliceFromSheetRegion",
  "addCharacterRigSlice",
  "addCharacterRigImportedSprite",
  "setCharacterRigSliceWorldPosition",
  "patchCharacterRigSlice",
  "renameCharacterRigSlice",
  "removeCharacterRigSlice",
  "reorderCharacterRigSlice",
  "setCharacterRigBinding",
  "clearCharacterRigBinding",
  "setCharacterRigSliceDepth",
  "setCharacterRigSliceDepthTexture",
  "clearCharacterRigSliceDepthTexture",
  "setCharacterRigSliceLayerPixels",
  "clearCharacterRigSliceEmbeddedBack",
  "promoteCharacterRigSliceToEmbedded",
]);

/** True when `dispatch` should attach the active character id (Character Setup / rig tools). */
export function commandUsesActiveCharacter(cmd: Command): boolean {
  return CHARACTER_RIG_COMMAND_TYPES.has(cmd.type);
}

function ensureCharacterRig(p: EditorProject, characterId?: string): CharacterRigConfig {
  return ensureCharacterRigForProject(p, characterId);
}

function getRig(p: EditorProject, characterId?: string): CharacterRigConfig | undefined {
  return getCharacterRig(p, characterId);
}

function activeClip(project: EditorProject) {
  return project.clips.find((c) => c.id === project.activeClipId)!;
}

function insertSorted(keys: Keyframe[], k: Keyframe): Keyframe[] {
  const next = keys.filter((x) => Math.abs(x.t - k.t) > 1e-9);
  next.push(k);
  next.sort((a, b) => a.t - b.t);
  return next;
}

function defaultBindPoseForNewChild(
  p: EditorProject,
  parentId: string | null,
  placeAtParentTip: boolean,
): { x: number; y: number; rotation: number; sx: number; sy: number } {
  if (!placeAtParentTip || parentId === null) {
    return { x: 40, y: 0, rotation: 0, sx: 1, sy: 1 };
  }
  const parent = p.bones.find((b) => b.id === parentId);
  if (!parent) {
    return { x: 40, y: 0, rotation: 0, sx: 1, sy: 1 };
  }
  const tip = childBindTranslationAtParentTip(p, parentId);
  if (!tip) return { x: 40, y: 0, rotation: 0, sx: 1, sy: 1 };
  return { x: tip.x, y: tip.y, rotation: 0, sx: 1, sy: 1 };
}

function syncDirectChildrenFollowParentTip(p: EditorProject, parentId: string): void {
  const tip = childBindTranslationAtParentTip(p, parentId);
  if (!tip) return;
  for (const c of p.bones) {
    if (c.parentId === parentId && c.followParentTip) {
      c.bindPose.x = tip.x;
      c.bindPose.y = tip.y;
    }
  }
}

function boneSubtreeIds(project: EditorProject, rootBoneId: string): Set<string> {
  const out = new Set<string>();
  const q: string[] = [rootBoneId];
  while (q.length) {
    const id = q.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const b of project.bones) {
      if (b.parentId === id) q.push(b.id);
    }
  }
  return out;
}

/**
 * Character Setup: after editing bind pose bones, keep already-laid-out sprite slices visually stable
 * by re-deriving stored binding locals from each slice's current world center.
 *
 * Without this, only the slices bound to the edited bone subtree "jump" when switching render paths
 * (rigid quads vs generated `rig_slice_*` meshes) or after regenerating meshes.
 */
function resyncBindingLocalsForBoneSubtree(project: EditorProject, editedBoneId: string): void {
  const rigs: CharacterRigConfig[] = [];
  if (project.characterRigs) rigs.push(...Object.values(project.characterRigs));
  if ((project as any).characterRig) rigs.push((project as any).characterRig as CharacterRigConfig);
  if (rigs.length === 0) return;

  const affected = boneSubtreeIds(project, editedBoneId);
  const Wbind4ByBone = worldBindBoneMatrices4(project);

  for (const rig of rigs) {
    if (!rig?.bindings?.length || !rig?.slices?.length) continue;
    for (const b of rig.bindings) {
      if (!affected.has(b.boneId)) continue;
      const s = rig.slices.find((x) => x.id === b.sliceId);
      if (!s) continue;
      const W = Wbind4ByBone.get(b.boneId);
      if (!W) continue;
      const inv = mat4Invert(W);
      if (!inv) continue;
      const loc = transformPointMat4(inv, s.worldCx, s.worldCy, 0);
      b.localX = loc.x;
      b.localY = loc.y;
      b.localZ = loc.z;
    }
  }
}

export function applyCommand(project: EditorProject, cmd: Command): EditorProject {
  const p: EditorProject = structuredClone(project);

  if (cmd.type === "setReferenceImage") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    p.referenceImage = {
      fileName: cmd.fileName,
      mimeType: mime,
      dataBase64: cmd.dataBase64,
    };
    return p;
  }
  if (cmd.type === "clearReferenceImage") {
    delete p.referenceImage;
    return p;
  }

  if (cmd.type === "addDemoSkinnedMesh") {
    const root = p.bones.find((b) => b.parentId === null);
    if (!root) return p;
    const mesh = createDemoSkinnedMesh(root.id);
    if (!p.skinnedMeshes) p.skinnedMeshes = [];
    p.skinnedMeshes.push(mesh);
    return p;
  }
  if (cmd.type === "clearSkinnedMeshes") {
    delete p.skinnedMeshes;
    return p;
  }

  if (cmd.type === "addSkinnedMesh") {
    const boneIds = new Set(p.bones.map((b) => b.id));
    if (validateSkinnedMesh(cmd.mesh, boneIds).length > 0) return project;
    const existing = new Set((p.skinnedMeshes ?? []).map((m) => m.id));
    if (existing.has(cmd.mesh.id)) return project;
    if (!p.skinnedMeshes) p.skinnedMeshes = [];
    p.skinnedMeshes.push(structuredClone(cmd.mesh));
    return p;
  }

  if (cmd.type === "setMeshVertexInfluences") {
    const boneIds = new Set(p.bones.map((b) => b.id));
    const mesh = p.skinnedMeshes?.find((m) => m.id === cmd.meshId);
    if (!mesh) return project;
    if (cmd.vertexIndex < 0 || cmd.vertexIndex >= mesh.vertices.length) return project;
    const row = sanitizeInfluenceRow(cmd.influences, boneIds);
    mesh.influences = [...mesh.influences];
    mesh.influences[cmd.vertexIndex] = row;
    if (validateSkinnedMesh(mesh, boneIds).length > 0) return project;
    return p;
  }

  if (cmd.type === "setMeshVerticesInfluences") {
    const boneIds = new Set(p.bones.map((b) => b.id));
    const mesh = p.skinnedMeshes?.find((m) => m.id === cmd.meshId);
    if (!mesh) return project;
    for (const u of cmd.updates) {
      if (u.vertexIndex < 0 || u.vertexIndex >= mesh.vertices.length) return project;
    }
    mesh.influences = [...mesh.influences];
    for (const u of cmd.updates) {
      mesh.influences[u.vertexIndex] = sanitizeInfluenceRow(u.influences, boneIds);
    }
    if (validateSkinnedMesh(mesh, boneIds).length > 0) return project;
    return p;
  }

  if (cmd.type === "addDemoIkChain") {
    const root = p.bones.find((b) => b.parentId === null);
    if (!root) return p;
    let mid = p.bones.find((b) => b.parentId === root.id && b.name === "ik_mid");
    let tip = p.bones.find((b) => b.parentId === mid?.id && b.name === "ik_tip");
    if (!mid) {
      mid = {
        id: createId("bone"),
        parentId: root.id,
        name: "ik_mid",
        bindPose: { x: 70, y: 0, rotation: 0, sx: 1, sy: 1 },
        length: 65,
      };
      p.bones.push(mid);
    }
    if (!tip) {
      tip = {
        id: createId("bone"),
        parentId: mid.id,
        name: "ik_tip",
        bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 },
        length: 0,
      };
      p.bones.push(tip);
    }
    root.length = 70;
    mid.length = 65;
    tip.length = 0;
    if (!p.ikTwoBoneChains) p.ikTwoBoneChains = [];
    if (p.ikTwoBoneChains.some((c) => c.name === "demo_arm")) return p;
    p.ikTwoBoneChains.push({
      id: createId("ikchain"),
      name: "demo_arm",
      enabled: true,
      rootBoneId: root.id,
      midBoneId: mid.id,
      tipBoneId: tip.id,
      targetX: 130,
      targetY: 35,
    });
    return p;
  }

  if (cmd.type === "addTwoBoneIkChainFromTip") {
    const tip = p.bones.find((b) => b.id === cmd.tipBoneId);
    if (!tip) return p;
    const mid = tip.parentId ? p.bones.find((b) => b.id === tip.parentId) : null;
    if (!mid) return p;
    const root = mid.parentId ? p.bones.find((b) => b.id === mid.parentId) : null;
    if (!root) return p;
    if (!p.rig) p.rig = {};
    if (!p.rig.ik) p.rig.ik = {};
    if (!p.rig.ik.twoBoneChains) p.rig.ik.twoBoneChains = [];
    // Avoid duplicates on same tip.
    if (p.rig.ik.twoBoneChains.some((c) => c.tipBoneId === tip.id)) return p;
    const tips = worldBindBoneTips(p);
    const tpos = tips.get(tip.id);
    const tx = tpos?.x ?? 0;
    const ty = tpos?.y ?? 0;
    p.rig.ik.twoBoneChains.push({
      id: createId("ikchain"),
      name: cmd.name,
      enabled: true,
      rootBoneId: root.id,
      midBoneId: mid.id,
      tipBoneId: tip.id,
      targetX: tx,
      targetY: ty,
      allowStretch: cmd.allowStretch ?? false,
    });
    return p;
  }

  if (cmd.type === "setIkChainTarget") {
    const ch =
      p.rig?.ik?.twoBoneChains?.find((c) => c.id === cmd.chainId) ??
      p.ikTwoBoneChains?.find((c) => c.id === cmd.chainId);
    if (!ch) return p;
    ch.targetX = cmd.targetX;
    ch.targetY = cmd.targetY;
    return p;
  }

  if (cmd.type === "setIkChainEnabled") {
    const ch =
      p.rig?.ik?.twoBoneChains?.find((c) => c.id === cmd.chainId) ??
      p.ikTwoBoneChains?.find((c) => c.id === cmd.chainId);
    if (!ch) return p;
    ch.enabled = cmd.enabled;
    return p;
  }

  if (cmd.type === "removeIkChain") {
    const filter = (c: { id: string }) => c.id !== cmd.chainId;
    if (p.rig?.ik?.twoBoneChains?.length) {
      const next = p.rig.ik.twoBoneChains.filter(filter);
      if (next.length !== p.rig.ik.twoBoneChains.length) {
        if (next.length === 0) delete p.rig.ik.twoBoneChains;
        else p.rig.ik.twoBoneChains = next;
      }
    }
    if (p.ikTwoBoneChains?.length) {
      p.ikTwoBoneChains = p.ikTwoBoneChains.filter(filter);
      if (p.ikTwoBoneChains.length === 0) delete p.ikTwoBoneChains;
    }
    return p;
  }

  if (cmd.type === "addFabrikIkChainFromTip") {
    if (!p.bones.some((b) => b.id === cmd.tipBoneId)) return p;
    const byId = new Map(p.bones.map((b) => [b.id, b] as const));
    const maxB = Math.max(3, Math.min(cmd.maxBones ?? 8, 32));
    const rev: string[] = [];
    let cur: string | null = cmd.tipBoneId;
    while (cur && rev.length < maxB) {
      rev.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    rev.reverse();
    if (rev.length < 3) return p;
    if (!p.rig) p.rig = {};
    if (!p.rig.ik) p.rig.ik = {};
    if (!p.rig.ik.fabrikChains) p.rig.ik.fabrikChains = [];
    const tips = worldBindBoneTips(p);
    const tpos = tips.get(cmd.tipBoneId);
    const tx = tpos?.x ?? 0;
    const ty = tpos?.y ?? 0;
    p.rig.ik.fabrikChains.push({
      id: createId("ikfab"),
      name: cmd.name,
      enabled: true,
      boneIds: rev,
      targetX: tx,
      targetY: ty,
    });
    return p;
  }

  if (cmd.type === "setFabrikIkChainTarget") {
    const ch = getFabrikIkChainById(p, cmd.chainId);
    if (!ch) return p;
    ch.targetX = cmd.targetX;
    ch.targetY = cmd.targetY;
    return p;
  }

  if (cmd.type === "setFabrikIkChainEnabled") {
    const ch = getFabrikIkChainById(p, cmd.chainId);
    if (!ch) return p;
    ch.enabled = cmd.enabled;
    return p;
  }

  if (cmd.type === "removeFabrikIkChain") {
    const list = p.rig?.ik?.fabrikChains;
    if (!list) return p;
    const next = list.filter((c) => c.id !== cmd.chainId);
    if (next.length === list.length) return p;
    if (next.length === 0) delete p.rig!.ik!.fabrikChains;
    else p.rig!.ik!.fabrikChains = next;
    if (p.rig?.ik && Object.keys(p.rig.ik).length === 0) delete p.rig.ik;
    if (p.rig && Object.keys(p.rig).length === 0) delete p.rig;
    return p;
  }

  if (cmd.type === "bakeIkToFk") {
    const clip = activeClip(p);
    const times = (cmd.sampleTimes ?? []).filter((t) => Number.isFinite(t) && t >= 0);
    if (times.length === 0) return p;

    for (const t of times) {
      const baked = bakeIkTwoBoneChainRotKeysAtTime(p, t, cmd.chainId);
      if (!baked) continue;

      const writeRot = (boneId: string, v: number) => {
        let tr = clip.tracks.find((tt) => tt.boneId === boneId);
        if (!tr) {
          tr = { boneId, channels: [] };
          clip.tracks.push(tr);
        }
        let ch = tr.channels.find((cc) => cc.property === "rot");
        if (!ch) {
          ch = { property: "rot", interpolation: "linear", keys: [] };
          tr.channels.push(ch);
        }
        ch.keys = insertSorted(ch.keys, { t, v });
      };

      writeRot(baked.rootBoneId, baked.keys.rootRotOffsetFromBind);
      writeRot(baked.midBoneId, baked.keys.midRotOffsetFromBind);
    }
    return p;
  }

  if (cmd.type === "ensureIkTargetControl") {
    const chain =
      (p.rig?.ik?.twoBoneChains ?? p.ikTwoBoneChains ?? []).find((c) => c.id === cmd.chainId) ??
      getFabrikIkChainById(p, cmd.chainId);
    if (!chain) return p;
    if (!p.rig) p.rig = {};
    if (!p.rig.controls) p.rig.controls = {};
    if (!p.rig.controls.ikTargets2d) p.rig.controls.ikTargets2d = [];
    const existing = p.rig.controls.ikTargets2d.find((c) => c.chainId === chain.id);
    if (existing) return p;
    p.rig.controls.ikTargets2d.push({
      id: createId("ctl"),
      name: `${chain.name}_target`,
      enabled: true,
      chainId: chain.id,
      x: chain.targetX,
      y: chain.targetY,
      ...(typeof chain.poleX === "number" && typeof chain.poleY === "number" ? { poleX: chain.poleX, poleY: chain.poleY } : {}),
    });
    return p;
  }

  if (cmd.type === "setIkTargetControlEnabled") {
    const ctl = p.rig?.controls?.ikTargets2d?.find((c) => c.id === cmd.controlId);
    if (!ctl) return p;
    ctl.enabled = cmd.enabled;
    return p;
  }

  if (cmd.type === "setIkTargetControlBase") {
    const ctl = p.rig?.controls?.ikTargets2d?.find((c) => c.id === cmd.controlId);
    if (!ctl) return p;
    ctl.x = cmd.x;
    ctl.y = cmd.y;
    if (typeof cmd.poleX === "number" && typeof cmd.poleY === "number") {
      ctl.poleX = cmd.poleX;
      ctl.poleY = cmd.poleY;
    }
    return p;
  }

  if (cmd.type === "addIkTargetControlKeyframe") {
    const clip = activeClip(p);
    if (!Number.isFinite(cmd.t) || cmd.t < 0) return p;
    if (!Number.isFinite(cmd.v)) return p;
    if (!clip.controlTracks) clip.controlTracks = [];
    let tr = clip.controlTracks.find((t) => t.controlId === cmd.controlId);
    if (!tr) {
      tr = { controlId: cmd.controlId, channels: [] };
      clip.controlTracks.push(tr);
    }
    let ch = tr.channels.find((c) => c.property === cmd.property);
    if (!ch) {
      ch = { property: cmd.property, interpolation: "linear", keys: [] };
      tr.channels.push(ch);
    }
    ch.keys = insertSorted(ch.keys, { t: cmd.t, v: cmd.v });
    return p;
  }

  if (cmd.type === "addCharacter") {
    const rootId = createId("bone");
    const charId = createId("char");
    const n = (p.characters?.length ?? 0) + 1;
    const offsetX = (n - 1) * 200;
    if (!p.characters) p.characters = [];
    if (!p.characterRigs) p.characterRigs = {};
    p.bones.push({
      id: rootId,
      parentId: null,
      name: "root",
      bindPose: { x: offsetX, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 0,
    });
    const label = cmd.name.trim() || `Character ${n}`;
    p.characters.push({ id: charId, name: label, rootBoneId: rootId });
    p.characterRigs[charId] = { spriteSheets: [], slices: [], bindings: [], sliceDepths: [] };
    delete p.characterRig;
    return p;
  }

  if (cmd.type === "renameCharacterSlot") {
    const c = p.characters?.find((x) => x.id === cmd.characterId);
    if (!c) return project;
    const name = cmd.name.trim();
    if (!name) return project;
    c.name = name;
    return p;
  }

  if (cmd.type === "setCharacterRigSpriteSheet") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    const rig = ensureCharacterRig(p, cmd.characterId);
    const id = createId("sheet");
    rig.spriteSheets = [
      {
        id,
        fileName: cmd.fileName,
        mimeType: mime,
        dataBase64: cmd.dataBase64,
        ...(typeof cmd.pixelWidth === "number" && cmd.pixelWidth > 0 ? { pixelWidth: cmd.pixelWidth } : {}),
        ...(typeof cmd.pixelHeight === "number" && cmd.pixelHeight > 0 ? { pixelHeight: cmd.pixelHeight } : {}),
      },
    ];
    rig.slices = [];
    rig.bindings = [];
    rig.sliceDepths = [];
    return p;
  }

  if (cmd.type === "addCharacterRigSpriteSheet") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    const rig = ensureCharacterRig(p, cmd.characterId);
    rig.spriteSheets.push({
      id: createId("sheet"),
      fileName: cmd.fileName,
      mimeType: mime,
      dataBase64: cmd.dataBase64,
      ...(typeof cmd.pixelWidth === "number" && cmd.pixelWidth > 0 ? { pixelWidth: cmd.pixelWidth } : {}),
      ...(typeof cmd.pixelHeight === "number" && cmd.pixelHeight > 0 ? { pixelHeight: cmd.pixelHeight } : {}),
    });
    return p;
  }

  if (cmd.type === "removeCharacterRigSpriteSheet") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return p;
    rig.spriteSheets = rig.spriteSheets.filter((s) => s.id !== cmd.sheetId);
    for (const s of rig.slices) {
      if (s.sheetId === cmd.sheetId) {
        s.x = 0;
        s.y = 0;
        s.width = 0;
        s.height = 0;
        delete s.sheetId;
        delete s.embedded;
      }
    }
    return p;
  }

  if (cmd.type === "clearCharacterRigSpriteSheet") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return p;
    rig.spriteSheets = [];
    rig.slices = [];
    rig.bindings = [];
    rig.sliceDepths = [];
    if (p.skinnedMeshes?.length) {
      p.skinnedMeshes = p.skinnedMeshes.filter((m) => !m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX));
      if (p.skinnedMeshes.length === 0) delete p.skinnedMeshes;
    }
    return p;
  }

  if (cmd.type === "clearCharacterRig") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    rig.spriteSheets = [];
    rig.slices = [];
    rig.bindings = [];
    rig.sliceDepths = [];
    if (p.skinnedMeshes?.length) {
      p.skinnedMeshes = p.skinnedMeshes.filter((m) => !m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX));
      if (p.skinnedMeshes.length === 0) delete p.skinnedMeshes;
    }
    return p;
  }

  if (cmd.type === "addCharacterRigEmptyPart") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    const n = rig.slices.length;
    const worldCx = n * 14;
    const worldCy = n * 14;
    rig.slices.push({
      id: createId("slice"),
      name: `Part ${n + 1}`,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      worldCx,
      worldCy,
      side: "front",
    });
    return p;
  }

  if (cmd.type === "assignCharacterRigSliceFromSheetRegion") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const sheet = rig.spriteSheets.find((s) => s.id === cmd.sheetId);
    const slice = rig.slices.find((s) => s.id === cmd.sliceId);
    if (!sheet || !slice) return project;
    if (!(cmd.width > 0) || !(cmd.height > 0)) return project;
    slice.x = cmd.x;
    slice.y = cmd.y;
    slice.width = cmd.width;
    slice.height = cmd.height;
    slice.sheetId = cmd.sheetId;
    delete slice.embedded;
    return p;
  }

  if (cmd.type === "addCharacterRigSlice") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    if (rig.spriteSheets.length === 0) return project;
    if (!(cmd.width > 0) || !(cmd.height > 0)) return project;
    const name = cmd.name.trim() || `Part ${rig.slices.length + 1}`;
    const id = createId("slice");
    const n = rig.slices.length;
    const worldCx = typeof cmd.worldCx === "number" && Number.isFinite(cmd.worldCx) ? cmd.worldCx : n * 14;
    const worldCy = typeof cmd.worldCy === "number" && Number.isFinite(cmd.worldCy) ? cmd.worldCy : n * 14;
    const sheetId = cmd.sheetId ?? rig.spriteSheets[0]!.id;
    rig.slices.push({
      id,
      name,
      x: cmd.x,
      y: cmd.y,
      width: cmd.width,
      height: cmd.height,
      worldCx,
      worldCy,
      side: "front",
      sheetId,
    });
    return p;
  }

  if (cmd.type === "addCharacterRigImportedSprite") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    if (!(cmd.pixelWidth > 0) || !(cmd.pixelHeight > 0)) return project;
    const rig = ensureCharacterRig(p, cmd.characterId);
    const n = rig.slices.length;
    const worldCx = typeof cmd.worldCx === "number" && Number.isFinite(cmd.worldCx) ? cmd.worldCx : n * 14;
    const worldCy = typeof cmd.worldCy === "number" && Number.isFinite(cmd.worldCy) ? cmd.worldCy : n * 14;
    const name = cmd.name.trim() || `Part ${n + 1}`;
    rig.slices.push({
      id: createId("slice"),
      name,
      x: 0,
      y: 0,
      width: cmd.pixelWidth,
      height: cmd.pixelHeight,
      worldCx,
      worldCy,
      side: "front",
      embedded: {
        mimeType: mime,
        dataBase64: cmd.dataBase64,
        pixelWidth: cmd.pixelWidth,
        pixelHeight: cmd.pixelHeight,
      },
    });
    return p;
  }

  if (cmd.type === "patchCharacterRigSlice") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (typeof cmd.name === "string") {
      const n = cmd.name.trim();
      if (n) s.name = n;
    }
    if (cmd.side === "front" || cmd.side === "back") s.side = cmd.side;
    return p;
  }

  if (cmd.type === "setCharacterRigSliceWorldPosition") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (!Number.isFinite(cmd.worldCx) || !Number.isFinite(cmd.worldCy)) return project;
    s.worldCx = cmd.worldCx;
    s.worldCy = cmd.worldCy;
    /** Bound slices draw from stored bind locals; refresh so drag matches {@link setCharacterRigBinding} semantics. */
    const b = rig.bindings.find((x) => x.sliceId === cmd.sliceId);
    if (b) {
      // Bindings are stored in the rig's canonical bind space (full 4×4 bind chain, ADR 0011).
      // This must NOT depend on the current view mode (2D vs 2.5D vs 3D), otherwise parts can jump.
      const Wbind4 = worldBindBoneMatrices4(p).get(b.boneId);
      if (Wbind4) {
        const inv = mat4Invert(Wbind4);
        if (inv) {
          const loc = transformPointMat4(inv, s.worldCx, s.worldCy, 0);
          b.localX = loc.x;
          b.localY = loc.y;
          b.localZ = loc.z;
        }
      }
    }
    return p;
  }

  if (cmd.type === "renameCharacterRigSlice") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    s.name = cmd.name.trim() || s.name;
    return p;
  }

  if (cmd.type === "removeCharacterRigSlice") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    rig.slices = rig.slices.filter((s) => s.id !== cmd.sliceId);
    rig.bindings = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    rig.sliceDepths = (rig.sliceDepths ?? []).filter((d) => d.sliceId !== cmd.sliceId);
    const rigMeshId = `${RIG_SLICE_MESH_ID_PREFIX}${cmd.sliceId}`;
    if (p.skinnedMeshes?.length) {
      p.skinnedMeshes = p.skinnedMeshes.filter((m) => m.id !== rigMeshId);
      if (p.skinnedMeshes.length === 0) delete p.skinnedMeshes;
    }
    return p;
  }

  if (cmd.type === "reorderCharacterRigSlice") {
    const rig = getRig(p, cmd.characterId);
    if (!rig?.slices?.length) return project;
    const arr = [...rig.slices];
    const from = arr.findIndex((x) => x.id === cmd.sliceId);
    if (from < 0) return project;
    if (cmd.insertBeforeSliceId !== null) {
      const tid = cmd.insertBeforeSliceId;
      if (tid === cmd.sliceId) return project;
      if (!arr.some((x) => x.id === tid)) return project;
    }
    const [item] = arr.splice(from, 1);
    let insertAt = arr.length;
    if (cmd.insertBeforeSliceId !== null) {
      insertAt = arr.findIndex((x) => x.id === cmd.insertBeforeSliceId);
      if (insertAt < 0) insertAt = arr.length;
    }
    arr.splice(insertAt, 0, item);
    rig.slices = arr;
    return p;
  }

  if (cmd.type === "setCharacterRigBinding") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    const slice = rig.slices.find((s) => s.id === cmd.sliceId);
    if (!slice) return project;
    if (!p.bones.some((b) => b.id === cmd.boneId)) return project;
    // Compute local attachment so binding does NOT move the slice at bind pose.
    let localX: number | undefined;
    let localY: number | undefined;
    let localZ: number | undefined;
    let rotOffset: number | undefined;
    // Store bindings in canonical bind space (full 4×4 bind chain), independent of view mode.
    const Wbind4 = worldBindBoneMatrices4(p).get(cmd.boneId);
    if (Wbind4) {
      const inv = mat4Invert(Wbind4);
      if (inv) {
        const loc = transformPointMat4(inv, slice.worldCx, slice.worldCy, 0);
        localX = loc.x;
        localY = loc.y;
        localZ = loc.z;
      }
    }
    const others = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    others.push({ sliceId: cmd.sliceId, boneId: cmd.boneId, localX, localY, localZ, rotOffset });
    rig.bindings = others;
    return p;
  }

  if (cmd.type === "clearCharacterRigBinding") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    rig.bindings = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    return p;
  }

  if (cmd.type === "setCharacterRigSliceDepth") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    if (!rig.slices.some((s) => s.id === cmd.sliceId)) return project;
    const depths = [...(rig.sliceDepths ?? [])].filter((d) => d.sliceId !== cmd.sliceId);
    depths.push({
      sliceId: cmd.sliceId,
      maxDepthFront: cmd.maxDepthFront,
      maxDepthBack: cmd.syncBackWithFront ? cmd.maxDepthFront : cmd.maxDepthBack,
      syncBackWithFront: cmd.syncBackWithFront,
    });
    rig.sliceDepths = depths;
    return p;
  }

  if (cmd.type === "setCharacterRigSliceDepthTexture") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (!(s.width > 0) || !(s.height > 0)) return project;
    if (cmd.pixelWidth !== s.width || cmd.pixelHeight !== s.height) return project;

    const existing = (rig.sliceDepths ?? []).find((d) => d.sliceId === cmd.sliceId);
    const base = existing ?? {
      sliceId: cmd.sliceId,
      maxDepthFront: 0,
      maxDepthBack: 0,
      syncBackWithFront: true,
    };
    const patch = {
      mimeType: cmd.mimeType,
      dataBase64: cmd.dataBase64,
      pixelWidth: cmd.pixelWidth,
      pixelHeight: cmd.pixelHeight,
    };
    const next =
      cmd.side === "front"
        ? { ...base, depthTextureFront: patch }
        : { ...base, depthTextureBack: patch };
    rig.sliceDepths = [...(rig.sliceDepths ?? []).filter((d) => d.sliceId !== cmd.sliceId), next];
    return p;
  }

  if (cmd.type === "clearCharacterRigSliceDepthTexture") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const existing = (rig.sliceDepths ?? []).find((d) => d.sliceId === cmd.sliceId);
    if (!existing) return project;
    const next =
      cmd.side === "front"
        ? { ...existing, depthTextureFront: undefined }
        : { ...existing, depthTextureBack: undefined };
    rig.sliceDepths = [...(rig.sliceDepths ?? []).filter((d) => d.sliceId !== cmd.sliceId), next];
    return p;
  }

  if (cmd.type === "setCharacterRigSliceLayerPixels") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (!(s.width > 0) || !(s.height > 0)) return project;
    const img = cmd.image;
    if (img.pixelWidth !== s.width || img.pixelHeight !== s.height) return project;
    const norm = normalizeReferenceImageMime(img.mimeType);
    if (!norm || typeof img.dataBase64 !== "string" || img.dataBase64.length === 0) return project;
    const payload: CharacterRigSliceEmbeddedImage = { ...img, mimeType: norm };
    if (cmd.layer === "front") {
      s.embedded = payload;
      if (s.sheetId) {
        delete s.sheetId;
        s.x = 0;
        s.y = 0;
      }
    } else {
      s.embeddedBack = payload;
    }
    return p;
  }

  if (cmd.type === "clearCharacterRigSliceEmbeddedBack") {
    const rig = getRig(p, cmd.characterId);
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    delete s.embeddedBack;
    return p;
  }

  if (cmd.type === "promoteCharacterRigSliceToEmbedded") {
    const rig = ensureCharacterRig(p, cmd.characterId);
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (s.embedded) return project;
    if (!s.sheetId) return project;
    const img = cmd.image;
    if (img.pixelWidth !== s.width || img.pixelHeight !== s.height) return project;
    const norm = normalizeReferenceImageMime(img.mimeType);
    if (!norm || typeof img.dataBase64 !== "string" || img.dataBase64.length === 0) return project;
    s.embedded = { ...img, mimeType: norm };
    delete s.sheetId;
    s.x = 0;
    s.y = 0;
    return p;
  }

  if (cmd.type === "syncCharacterRigSkinnedMeshes") {
    // Build as much as possible even when bindings are incomplete.
    // Animator no longer has a rigid-quad fallback, so partial meshes are required to avoid "skeleton only".
    /** Sonst bleiben Meshes / 3D-Vorschau papierflach (maxDepth 0). */
    ensureMinimalSliceDepthOnMeshSync(p);
    const boneIds = new Set(p.bones.map((b) => b.id));
    const built = skinnedMeshesFromCharacterRig(p);
    for (const m of built) {
      if (validateSkinnedMesh(m, boneIds).length > 0) return project;
    }
    const rest = (p.skinnedMeshes ?? []).filter((m) => !m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX));
    const merged = [...rest, ...built];
    if (merged.length === 0) delete p.skinnedMeshes;
    else p.skinnedMeshes = merged;
    return p;
  }

  if (cmd.type === "setBoneTranslationKeysAtTime") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b || !Number.isFinite(cmd.t) || !Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) return project;
    const clip = activeClip(p);
    let tr = clip.tracks.find((t) => t.boneId === cmd.boneId);
    if (!tr) {
      tr = { boneId: cmd.boneId, channels: [] };
      clip.tracks.push(tr);
    }
    let chx = tr.channels.find((c) => c.property === "tx");
    if (!chx) {
      chx = { property: "tx", interpolation: "linear", keys: [] };
      tr.channels.push(chx);
    }
    let chy = tr.channels.find((c) => c.property === "ty");
    if (!chy) {
      chy = { property: "ty", interpolation: "linear", keys: [] };
      tr.channels.push(chy);
    }
    chx.keys = insertSorted(chx.keys, { t: cmd.t, v: cmd.x - b.bindPose.x });
    chy.keys = insertSorted(chy.keys, { t: cmd.t, v: cmd.y - b.bindPose.y });
    return p;
  }

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
      if (b.followParentTip && (cmd.partial.x !== undefined || cmd.partial.y !== undefined)) {
        b.followParentTip = false;
      }
      Object.assign(b.bindPose, cmd.partial);
      syncDirectChildrenFollowParentTip(p, b.id);
      // Keep already positioned slices stable when bind pose changes in Setup.
      resyncBindingLocalsForBoneSubtree(p, b.id);
    }
    return p;
  }

  if (cmd.type === "setBindBone3d") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b) return p;
    const base: BoneBind3d = { z: 0, depthOffset: 0, tilt: 0, spin: 0 };
    b.bindBone3d = { ...base, ...b.bindBone3d, ...cmd.partial };
    return p;
  }

  if (cmd.type === "setBoneLength") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b || !Number.isFinite(cmd.length) || cmd.length < 0) return project;
    b.length = cmd.length;
    syncDirectChildrenFollowParentTip(p, b.id);
    resyncBindingLocalsForBoneSubtree(p, b.id);
    return p;
  }

  if (cmd.type === "setBoneLengthAndBindRotation") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b || !Number.isFinite(cmd.length) || cmd.length < 0 || !Number.isFinite(cmd.rotation)) return project;
    b.length = cmd.length;
    b.bindPose.rotation = cmd.rotation;
    syncDirectChildrenFollowParentTip(p, b.id);
    resyncBindingLocalsForBoneSubtree(p, b.id);
    return p;
  }

  if (cmd.type === "snapBoneToParentTip") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b || b.parentId === null) return project;
    const tip = childBindTranslationAtParentTip(p, b.parentId);
    if (!tip) return project;
    b.bindPose.x = tip.x;
    b.bindPose.y = tip.y;
    resyncBindingLocalsForBoneSubtree(p, b.id);
    return p;
  }

  if (cmd.type === "setBoneFollowParentTip") {
    const b = p.bones.find((x) => x.id === cmd.boneId);
    if (!b || b.parentId === null) return project;
    b.followParentTip = cmd.follow;
    if (cmd.follow) {
      const tip = childBindTranslationAtParentTip(p, b.parentId);
      if (tip) {
        b.bindPose.x = tip.x;
        b.bindPose.y = tip.y;
      }
    }
    resyncBindingLocalsForBoneSubtree(p, b.id);
    return p;
  }

  if (cmd.type === "addBone") {
    const id = createId("bone");
    const placeTip = cmd.placeAtParentTip !== false;
    const bone: Bone = {
      id,
      parentId: cmd.parentId,
      name: cmd.name,
      bindPose: defaultBindPoseForNewChild(p, cmd.parentId, placeTip),
      length: 40,
    };
    if (cmd.parentId !== null && placeTip) {
      bone.followParentTip = true;
    }
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
    if (p.skinnedMeshes?.length) {
      p.skinnedMeshes = p.skinnedMeshes.filter(
        (m) => !m.influences.some((row) => row.some((inf) => inf.boneId === cmd.boneId)),
      );
      if (p.skinnedMeshes.length === 0) delete p.skinnedMeshes;
    }
    if (p.ikTwoBoneChains?.length) {
      p.ikTwoBoneChains = p.ikTwoBoneChains.filter(
        (c) => c.rootBoneId !== cmd.boneId && c.midBoneId !== cmd.boneId && c.tipBoneId !== cmd.boneId,
      );
      if (p.ikTwoBoneChains.length === 0) delete p.ikTwoBoneChains;
    }
    if (p.characterRigs) {
      for (const rig of Object.values(p.characterRigs)) {
        if (rig.bindings?.length) {
          rig.bindings = rig.bindings.filter((b) => b.boneId !== cmd.boneId);
        }
      }
    }
    if (p.characterRig?.bindings?.length) {
      p.characterRig.bindings = p.characterRig.bindings.filter((b) => b.boneId !== cmd.boneId);
    }
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

  if (cmd.type === "purgeClipTranslationRotationKeysAtTime") {
    if (!Number.isFinite(cmd.t)) return p;
    const clip = activeClip(p);
    const timeEps = 1e-4;
    const purgeProps = new Set<ChannelProperty>(["tx", "ty", "rot"]);
    const nextTracks: AnimationClip["tracks"] = [];
    for (const tr of clip.tracks) {
      const channels = tr.channels
        .map((c) => {
          if (!purgeProps.has(c.property)) return c;
          const keys = c.keys.filter((k) => Math.abs(k.t - cmd.t) > timeEps);
          return { ...c, keys };
        })
        .filter((c) => c.keys.length > 0);
      if (channels.length > 0) nextTracks.push({ ...tr, channels });
    }
    clip.tracks = nextTracks;
    return p;
  }

  if (cmd.type === "addAnimationClip") {
    const id = createId("clip");
    const name = cmd.name.trim() || `Clip ${p.clips.length + 1}`;
    p.clips.push({ id, name, tracks: [] });
    p.activeClipId = id;
    return p;
  }

  if (cmd.type === "removeAnimationClip") {
    if (p.clips.length <= 1) return p;
    const next = p.clips.filter((c) => c.id !== cmd.clipId);
    if (next.length === p.clips.length) return p;
    p.clips = next;
    if (p.activeClipId === cmd.clipId) {
      p.activeClipId = p.clips[0]!.id;
    }
    return p;
  }

  if (cmd.type === "renameAnimationClip") {
    const c = p.clips.find((x) => x.id === cmd.clipId);
    if (!c) return p;
    const name = cmd.name.trim();
    if (!name) return p;
    c.name = name;
    return p;
  }

  if (cmd.type === "duplicateAnimationClip") {
    const src = p.clips.find((x) => x.id === cmd.clipId);
    if (!src) return p;
    const id = createId("clip");
    const copy: AnimationClip = {
      id,
      name: `${src.name} copy`,
      tracks: structuredClone(src.tracks),
    };
    p.clips.push(copy);
    p.activeClipId = id;
    return p;
  }

  if (cmd.type === "setActiveClip") {
    if (!p.clips.some((c) => c.id === cmd.clipId)) return p;
    p.activeClipId = cmd.clipId;
    return p;
  }

  if (cmd.type === "importAnimationClip") {
    const boneIds = new Set(p.bones.map((b) => b.id));
    for (const tr of cmd.clip.tracks) {
      if (!boneIds.has(tr.boneId)) return p;
    }
    const id = createId("clip");
    const incoming: AnimationClip = {
      id,
      name: cmd.clip.name.trim() || "Imported",
      tracks: structuredClone(cmd.clip.tracks),
    };
    p.clips.push(incoming);
    p.activeClipId = id;
    return p;
  }

  return p;
}
