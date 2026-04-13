import {
  createDemoSkinnedMesh,
  createId,
  normalizeReferenceImageMime,
  sanitizeInfluenceRow,
  validateSkinnedMesh,
  type Bone,
  type ChannelProperty,
  type CharacterRigConfig,
  type EditorProject,
  type Keyframe,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";

export type Command =
  | { type: "addBone"; parentId: string | null; name: string }
  | { type: "removeBone"; boneId: string }
  | { type: "renameBone"; boneId: string; name: string }
  | { type: "setBindPose"; boneId: string; partial: Partial<{ x: number; y: number; rotation: number; sx: number; sy: number }> }
  | { type: "setMetaName"; name: string }
  | { type: "setFps"; fps: number }
  | { type: "addKeyframe"; boneId: string; property: ChannelProperty; t: number; v: number }
  | { type: "removeKeyframe"; boneId: string; property: ChannelProperty; t: number }
  | { type: "setReferenceImage"; fileName: string; mimeType: string; dataBase64: string }
  | { type: "clearReferenceImage" }
  | { type: "addDemoSkinnedMesh" }
  | { type: "clearSkinnedMeshes" }
  | { type: "addSkinnedMesh"; mesh: SkinnedMesh }
  | { type: "setMeshVertexInfluences"; meshId: string; vertexIndex: number; influences: SkinInfluence[] }
  | { type: "setMeshVerticesInfluences"; meshId: string; updates: { vertexIndex: number; influences: SkinInfluence[] }[] }
  | { type: "addDemoIkChain" }
  | { type: "setIkChainTarget"; chainId: string; targetX: number; targetY: number }
  | { type: "setIkChainEnabled"; chainId: string; enabled: boolean }
  | { type: "removeIkChain"; chainId: string }
  | {
      type: "setCharacterRigSpriteSheet";
      fileName: string;
      mimeType: string;
      dataBase64: string;
      pixelWidth?: number;
      pixelHeight?: number;
    }
  | { type: "clearCharacterRigSpriteSheet" }
  | { type: "clearCharacterRig" }
  | {
      type: "addCharacterRigSlice";
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      worldCx?: number;
      worldCy?: number;
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
  | { type: "renameCharacterRigSlice"; sliceId: string; name: string }
  | { type: "removeCharacterRigSlice"; sliceId: string }
  | { type: "setCharacterRigBinding"; sliceId: string; boneId: string }
  | { type: "clearCharacterRigBinding"; sliceId: string }
  | {
      type: "setCharacterRigSliceDepth";
      sliceId: string;
      maxDepthFront: number;
      maxDepthBack: number;
      syncBackWithFront: boolean;
    };

function ensureCharacterRig(p: EditorProject): CharacterRigConfig {
  if (!p.characterRig) {
    p.characterRig = { spriteSheet: null, slices: [], bindings: [], sliceDepths: [] };
  } else if (!p.characterRig.sliceDepths) {
    p.characterRig.sliceDepths = [];
  }
  return p.characterRig;
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
      };
      p.bones.push(mid);
    }
    if (!tip) {
      tip = {
        id: createId("bone"),
        parentId: mid.id,
        name: "ik_tip",
        bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 },
      };
      p.bones.push(tip);
    }
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

  if (cmd.type === "setIkChainTarget") {
    const ch = p.ikTwoBoneChains?.find((c) => c.id === cmd.chainId);
    if (!ch) return p;
    ch.targetX = cmd.targetX;
    ch.targetY = cmd.targetY;
    return p;
  }

  if (cmd.type === "setIkChainEnabled") {
    const ch = p.ikTwoBoneChains?.find((c) => c.id === cmd.chainId);
    if (!ch) return p;
    ch.enabled = cmd.enabled;
    return p;
  }

  if (cmd.type === "removeIkChain") {
    if (!p.ikTwoBoneChains) return p;
    p.ikTwoBoneChains = p.ikTwoBoneChains.filter((c) => c.id !== cmd.chainId);
    if (p.ikTwoBoneChains.length === 0) delete p.ikTwoBoneChains;
    return p;
  }

  if (cmd.type === "setCharacterRigSpriteSheet") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    const rig = ensureCharacterRig(p);
    rig.spriteSheet = {
      fileName: cmd.fileName,
      mimeType: mime,
      dataBase64: cmd.dataBase64,
      ...(typeof cmd.pixelWidth === "number" && cmd.pixelWidth > 0 ? { pixelWidth: cmd.pixelWidth } : {}),
      ...(typeof cmd.pixelHeight === "number" && cmd.pixelHeight > 0 ? { pixelHeight: cmd.pixelHeight } : {}),
    };
    rig.slices = [];
    rig.bindings = [];
    rig.sliceDepths = [];
    return p;
  }

  if (cmd.type === "clearCharacterRigSpriteSheet") {
    if (!p.characterRig) return p;
    p.characterRig.spriteSheet = null;
    p.characterRig.slices = [];
    p.characterRig.bindings = [];
    p.characterRig.sliceDepths = [];
    return p;
  }

  if (cmd.type === "clearCharacterRig") {
    delete p.characterRig;
    return p;
  }

  if (cmd.type === "addCharacterRigSlice") {
    const rig = ensureCharacterRig(p);
    if (!rig.spriteSheet) return project;
    if (!(cmd.width > 0) || !(cmd.height > 0)) return project;
    const name = cmd.name.trim() || `Part ${rig.slices.length + 1}`;
    const id = createId("slice");
    const n = rig.slices.length;
    const worldCx = typeof cmd.worldCx === "number" && Number.isFinite(cmd.worldCx) ? cmd.worldCx : n * 14;
    const worldCy = typeof cmd.worldCy === "number" && Number.isFinite(cmd.worldCy) ? cmd.worldCy : n * 14;
    rig.slices.push({
      id,
      name,
      x: cmd.x,
      y: cmd.y,
      width: cmd.width,
      height: cmd.height,
      worldCx,
      worldCy,
    });
    return p;
  }

  if (cmd.type === "addCharacterRigImportedSprite") {
    const mime = normalizeReferenceImageMime(cmd.mimeType);
    if (!mime || !cmd.dataBase64) return project;
    if (!(cmd.pixelWidth > 0) || !(cmd.pixelHeight > 0)) return project;
    const rig = ensureCharacterRig(p);
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
      embedded: {
        mimeType: mime,
        dataBase64: cmd.dataBase64,
        pixelWidth: cmd.pixelWidth,
        pixelHeight: cmd.pixelHeight,
      },
    });
    return p;
  }

  if (cmd.type === "setCharacterRigSliceWorldPosition") {
    const rig = p.characterRig;
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    if (!Number.isFinite(cmd.worldCx) || !Number.isFinite(cmd.worldCy)) return project;
    s.worldCx = cmd.worldCx;
    s.worldCy = cmd.worldCy;
    return p;
  }

  if (cmd.type === "renameCharacterRigSlice") {
    const rig = p.characterRig;
    if (!rig) return project;
    const s = rig.slices.find((x) => x.id === cmd.sliceId);
    if (!s) return project;
    s.name = cmd.name.trim() || s.name;
    return p;
  }

  if (cmd.type === "removeCharacterRigSlice") {
    const rig = p.characterRig;
    if (!rig) return project;
    rig.slices = rig.slices.filter((s) => s.id !== cmd.sliceId);
    rig.bindings = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    rig.sliceDepths = (rig.sliceDepths ?? []).filter((d) => d.sliceId !== cmd.sliceId);
    return p;
  }

  if (cmd.type === "setCharacterRigBinding") {
    const rig = ensureCharacterRig(p);
    if (!rig.slices.some((s) => s.id === cmd.sliceId)) return project;
    if (!p.bones.some((b) => b.id === cmd.boneId)) return project;
    const others = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    others.push({ sliceId: cmd.sliceId, boneId: cmd.boneId });
    rig.bindings = others;
    return p;
  }

  if (cmd.type === "clearCharacterRigBinding") {
    const rig = p.characterRig;
    if (!rig) return project;
    rig.bindings = rig.bindings.filter((b) => b.sliceId !== cmd.sliceId);
    return p;
  }

  if (cmd.type === "setCharacterRigSliceDepth") {
    const rig = ensureCharacterRig(p);
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

  return p;
}
