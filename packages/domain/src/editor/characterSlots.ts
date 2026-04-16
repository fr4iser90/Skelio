import type {
  Bone,
  CharacterRigBinding,
  CharacterRigConfig,
  CharacterRigSpriteSheetEntry,
  CharacterRigSpriteSlice,
  EditorProject,
} from "./types.js";

/** @returns First character slot id, if any. */
export function resolveDefaultCharacterId(project: EditorProject): string | undefined {
  return project.characters?.[0]?.id;
}

/**
 * Resolves which character a rig-scoped command applies to.
 * Falls back to the first slot when `characterId` is missing or unknown.
 */
export function resolveRigCharacterId(project: EditorProject, characterId?: string): string | undefined {
  if (characterId && project.characterRigs && project.characterRigs[characterId]) {
    return characterId;
  }
  return resolveDefaultCharacterId(project);
}

/** Read rig for a slot, or legacy `characterRig` when migration has not run. */
export function getCharacterRig(project: EditorProject, characterId?: string): CharacterRigConfig | undefined {
  if (project.characterRigs) {
    const id =
      characterId && project.characterRigs[characterId] ? characterId : resolveDefaultCharacterId(project);
    if (id && project.characterRigs[id]) return project.characterRigs[id];
    return undefined;
  }
  return project.characterRig;
}

function emptyRig(): CharacterRigConfig {
  return { spriteSheets: [], slices: [], bindings: [], sliceDepths: [] };
}

/**
 * Ensures a mutable rig exists for editing. Uses `characterRigs` when present; otherwise legacy `characterRig`.
 */
export function ensureCharacterRigForProject(project: EditorProject, characterId?: string): CharacterRigConfig {
  if (project.characterRigs) {
    const id = resolveRigCharacterId(project, characterId);
    if (!id || !project.characterRigs[id]) {
      throw new Error("ensureCharacterRigForProject: no character slot");
    }
    const rig = project.characterRigs[id]!;
    if (!rig.spriteSheets) rig.spriteSheets = [];
    if (!rig.sliceDepths) rig.sliceDepths = [];
    if (project.characterRig) delete project.characterRig;
    return rig;
  }
  if (!project.characterRig) {
    project.characterRig = emptyRig();
  } else {
    if (!project.characterRig.spriteSheets) project.characterRig.spriteSheets = [];
    if (!project.characterRig.sliceDepths) project.characterRig.sliceDepths = [];
  }
  return project.characterRig;
}

/** Iterate each rig config (legacy single rig or all slots). */
export function* iterCharacterRigs(project: EditorProject): Generator<CharacterRigConfig> {
  if (project.characterRigs) {
    for (const rig of Object.values(project.characterRigs)) {
      yield rig;
    }
  } else if (project.characterRig) {
    yield project.characterRig;
  }
}

export function findSliceInCharacterRigs(
  project: EditorProject,
  sliceId: string,
): { rig: CharacterRigConfig; slice: CharacterRigSpriteSlice } | undefined {
  for (const rig of iterCharacterRigs(project)) {
    const slice = rig.slices?.find((s) => s.id === sliceId);
    if (slice) return { rig, slice };
  }
  return undefined;
}

export function findCharacterRigBinding(project: EditorProject, sliceId: string): CharacterRigBinding | undefined {
  for (const rig of iterCharacterRigs(project)) {
    const b = rig.bindings?.find((x) => x.sliceId === sliceId);
    if (b) return b;
  }
  return undefined;
}

/** All sprite slices from every character rig (draw order = per-rig order, then rigs in iteration order). */
export function allCharacterRigSlices(project: EditorProject): CharacterRigSpriteSlice[] {
  const out: CharacterRigSpriteSlice[] = [];
  for (const rig of iterCharacterRigs(project)) {
    for (const s of rig.slices ?? []) out.push(s);
  }
  return out;
}

export function allCharacterRigSpriteSheets(project: EditorProject): CharacterRigSpriteSheetEntry[] {
  const out: CharacterRigSpriteSheetEntry[] = [];
  for (const rig of iterCharacterRigs(project)) {
    for (const sh of rig.spriteSheets ?? []) out.push(sh);
  }
  return out;
}

export function findSliceDepthEntry(project: EditorProject, sliceId: string) {
  for (const rig of iterCharacterRigs(project)) {
    const d = rig.sliceDepths?.find((x) => x.sliceId === sliceId);
    if (d) return d;
  }
  return undefined;
}

/** Bone ids that belong to a character subtree (root inclusive). */
export function boneIdsInCharacterSubtree(project: EditorProject, rootBoneId: string): Set<string> {
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const b of project.bones) {
      if (b.parentId === id) walk(b.id);
    }
  };
  walk(rootBoneId);
  return out;
}

/**
 * True if this rig does not need more bindings for mesh sync: no pixel slices, or every pixel slice is bound.
 */
export function bindingsCompleteLenientForRig(rig: CharacterRigConfig, bones: Bone[]): boolean {
  if (!rig?.slices?.length) return true;
  const boneIds = new Set(bones.map((b) => b.id));
  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b.boneId] as const));
  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const bid = bindingBySlice.get(s.id);
    if (!bid || !boneIds.has(bid)) return false;
  }
  return true;
}

/** Same rules as legacy single-rig “wizard complete”: at least one pixel slice and every pixel slice bound. */
export function bindingsCompleteStrictForRig(rig: CharacterRigConfig, bones: Bone[]): boolean {
  if (!rig?.slices?.length) return false;
  const boneIds = new Set(bones.map((b) => b.id));
  const bindingBySlice = new Map((rig.bindings ?? []).map((b) => [b.sliceId, b.boneId] as const));
  let anyPixelSlice = false;
  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    anyPixelSlice = true;
    const bid = bindingBySlice.get(s.id);
    if (!bid || !boneIds.has(bid)) return false;
  }
  return anyPixelSlice;
}
