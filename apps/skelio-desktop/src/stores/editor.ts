import { applyCommand, commandUsesActiveCharacter, type Command } from "@skelio/application";
import {
  boneIdsInCharacterSubtree,
  characterRigBindingsComplete,
  characterRigBindingsCompleteStrict,
  createDefaultEditorProject,
  dehydrateEditorProjectForFolder,
  editorProjectToRuntime,
  getCharacterRig,
  hydrateEditorProjectFromFolder,
  normalizeEditorProjectInPlace,
  resolveDefaultCharacterId,
  stripMeshAssetPaths,
  validateEditorProject,
  type EditorProject,
} from "@skelio/domain";
import { PROJECT_MANIFEST_FILE } from "@skelio/domain";
import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";
import {
  isTauriApp,
  pickProjectRootFolder,
  readProjectManifest,
  readProjectSubpath,
  writeProjectManifest,
  writeProjectSubpath,
} from "../tauriProjectFs.js";

const MAX_UNDO = 80;
const MAX_SETUP_UNDO = 80;

/** Rig viewport camera: flat 2D vs mild Y squash (not true 3D). */
export type RigCameraViewKind = "2d" | "2.5d" | "3d";

/** Toolbar row 2: Animate / Rig / Export. */
export type WorkspaceMode = "animate" | "rig" | "export";

export const useEditorStore = defineStore("editor", () => {
  const project = ref<EditorProject>(createDefaultEditorProject());
  /** Set when a folder project is open (Tauri); `project.skelio.json` lives here. */
  const projectRootPath = ref<string | null>(null);
  const past = ref<EditorProject[]>([]);
  const future = ref<EditorProject[]>([]);
  const currentTime = ref(0);
  const playing = ref(false);
  const selectedBoneId = ref<string | null>(project.value.bones[0]!.id);
  /** Weight paint: which mesh / vertex is being edited (vertex chosen in viewport). */
  const selectedMeshId = ref<string | null>(null);
  const selectedVertexIndex = ref<number | null>(null);

  /** Weight brush (Viewport): shared with Inspector sliders. */
  const weightBrushEnabled = ref(false);
  const weightBrushRadius = ref(48);
  const weightBrushStrength = ref(0.06);
  const weightBrushSubtract = ref(false);

  /**
   * Character Setup (rigging wizard) — see `docs/16-character-setup-animate-boundary.md`.
   * Boundaries: Setup edits `characterRigDraftProject` only; Animate uses committed `project`.
   * Opening the wizard forces `workspaceMode === "rig"`. Switching to Animate discards the wizard.
   */
  const characterRigModalOpen = ref(false);
  /**
   * Draft project while Character Setup is open. Merged into `project` on **Done** only.
   * Animate / timeline must read committed `project`, not this draft, until merge.
   */
  const characterRigDraftProject = ref<EditorProject | null>(null);
  const characterRigDraftPast = ref<EditorProject[]>([]);
  const characterRigDraftFuture = ref<EditorProject[]>([]);

  /** Main window bind-pose / skeleton editing like wizard “Bones” step, without the assistant. */
  const quickRigMode = ref(false);

  const workspaceMode = ref<WorkspaceMode>("animate");

  /** Modal: pick a region from a sprite sheet into the selected slot. */
  const sheetSliceModalOpen = ref(false);
  const sheetSliceModalSheetId = ref<string | null>(null);

  /** Wizard step index (0–4); drives viewport behaviour in Character Setup. */
  const characterRigModalStep = ref(0);
  /** Next viewport click sets this bone’s bind-pose position. */
  const pendingBonePlacementId = ref<string | null>(null);

  /** New child bones: place bind X/Y at parent tip when parent length is positive, else default offset. */
  const placeNewBonesAtParentTip = ref(false);

  /** 2D animator canvas: show deformed `rig_slice_*` skinned triangles. */
  const animatorRigMeshDeformOverlay = ref(true);

  /**
   * Draw character-rig slices in the 2D animator as textured skinned meshes (Spine-like deformation)
   * when a `rig_slice_*` mesh exists, instead of only rigid quads.
   */
  const animatorDeformMeshDraw = ref(true);

  /** Character Setup only: rig viewport camera (2D ortho vs 2.5D/3D perspective). Reset to 2D when modal closes. */
  const rigCameraViewKind = ref<RigCameraViewKind>("2d");
  /** World Y squash factor (legacy pseudo-depth); 1 = none. */
  const rigCameraWorldYScale = computed(() => 1);

  /** Selected character-rig sprite slice (for pixel-accurate drag). */
  const selectedCharacterRigSliceId = ref<string | null>(null);

  /** Which character slot Character Setup / rig tools edit (`characterRigs[id]`). */
  const activeCharacterId = ref<string | null>(null);

  function syncActiveCharacterIdFromProject(p: EditorProject) {
    const ids = p.characters?.map((c) => c.id) ?? [];
    if (ids.length === 0) {
      activeCharacterId.value = null;
      return;
    }
    if (!activeCharacterId.value || !ids.includes(activeCharacterId.value)) {
      activeCharacterId.value = ids[0]!;
    }
  }

  const activeCharacterRig = computed(() => {
    const p = characterRigDraftProject.value ?? project.value;
    const id = activeCharacterId.value ?? resolveDefaultCharacterId(p);
    return id ? getCharacterRig(p, id) : undefined;
  });

  /** Bones / rig / meshes: draft while Character Setup is open, else committed `project`. */
  const rigEditProject = computed(() => characterRigDraftProject.value ?? project.value);

  const rigCharacterSlots = computed(() => rigEditProject.value.characters ?? []);

  const selectedBone = computed(() =>
    rigEditProject.value.bones.find((b) => b.id === selectedBoneId.value) ?? null,
  );

  function ensureSelection() {
    const p = rigEditProject.value;
    if (!selectedBoneId.value || !p.bones.some((b) => b.id === selectedBoneId.value)) {
      selectedBoneId.value = p.bones[0]?.id ?? null;
    }
  }

  function augmentCommand(cmd: Command): Command {
    if (commandUsesActiveCharacter(cmd) && activeCharacterId.value) {
      return { ...cmd, characterId: activeCharacterId.value };
    }
    return cmd;
  }

  function afterProjectCommit(next: EditorProject, applied: Command) {
    if (applied.type === "addCharacter") {
      const chars = next.characters;
      const last = chars?.length ? chars[chars.length - 1] : undefined;
      if (last) activeCharacterId.value = last.id;
    } else {
      syncActiveCharacterIdFromProject(next);
    }
  }

  function setActiveCharacterId(id: string | null) {
    const p = characterRigDraftProject.value ?? project.value;
    if (id && p.characters?.some((c) => c.id === id)) {
      activeCharacterId.value = id;
      const slot = p.characters!.find((c) => c.id === id)!;
      if ((p.characters?.length ?? 0) > 1) {
        const allow = boneIdsInCharacterSubtree(p, slot.rootBoneId);
        if (selectedBoneId.value && !allow.has(selectedBoneId.value)) {
          selectedBoneId.value = slot.rootBoneId;
        }
      }
    } else {
      syncActiveCharacterIdFromProject(p);
    }
  }

  function ensureMeshVertexSelection() {
    const meshes = rigEditProject.value.skinnedMeshes ?? [];
    if (!selectedMeshId.value || !meshes.some((m) => m.id === selectedMeshId.value)) {
      selectedMeshId.value = null;
      selectedVertexIndex.value = null;
      return;
    }
    const m = meshes.find((x) => x.id === selectedMeshId.value)!;
    if (
      selectedVertexIndex.value === null ||
      selectedVertexIndex.value < 0 ||
      selectedVertexIndex.value >= m.vertices.length
    ) {
      selectedVertexIndex.value = null;
    }
  }

  function cloneDraftPlain(): EditorProject {
    return structuredClone(toRaw(characterRigDraftProject.value!));
  }

  function mergeCharacterRigMeshesForDraft(): void {
    const raw = toRaw(characterRigDraftProject.value!);
    if (!characterRigBindingsComplete(raw)) return;
    const synced = applyCommand(raw, { type: "syncCharacterRigSkinnedMeshes" });
    if (synced !== raw) {
      characterRigDraftProject.value = synced;
    }
  }

  function dispatchToDraft(cmd: Command): boolean {
    const cur = toRaw(characterRigDraftProject.value!);
    const toApply = augmentCommand(cmd);
    const next = applyCommand(cur, toApply);
    if (next === cur) return false;
    const issues = validateEditorProject(next);
    if (issues.length > 0) {
      console.warn("Skelio: command rejected (Character Setup draft)", issues);
      return false;
    }
    characterRigDraftPast.value.push(structuredClone(cur));
    if (characterRigDraftPast.value.length > MAX_SETUP_UNDO) characterRigDraftPast.value.shift();
    characterRigDraftFuture.value = [];
    characterRigDraftProject.value = next;
    afterProjectCommit(next, toApply);
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForDraft();
    return true;
  }

  function draftUndo() {
    const prev = characterRigDraftPast.value.pop();
    if (!prev || !characterRigDraftProject.value) return;
    characterRigDraftFuture.value.push(cloneDraftPlain());
    characterRigDraftProject.value = prev;
    syncActiveCharacterIdFromProject(prev);
    ensureSelection();
    ensureMeshVertexSelection();
  }

  function draftRedo() {
    const nxt = characterRigDraftFuture.value.pop();
    if (!nxt || !characterRigDraftProject.value) return;
    characterRigDraftPast.value.push(cloneDraftPlain());
    characterRigDraftProject.value = nxt;
    syncActiveCharacterIdFromProject(nxt);
    ensureSelection();
    ensureMeshVertexSelection();
  }

  /** JSON / folder save: wizard draft if open, else committed project (with mesh sync where applicable). */
  function activeProjectForPersistence(): EditorProject {
    if (characterRigDraftProject.value) {
      let p = structuredClone(toRaw(characterRigDraftProject.value));
      if (characterRigBindingsComplete(p)) {
        p = applyCommand(p, { type: "syncCharacterRigSkinnedMeshes" });
      }
      return p;
    }
    mergeCharacterRigMeshesForPersist();
    return toRaw(project.value);
  }

  function selectMeshVertex(meshId: string, vertexIndex: number) {
    selectedMeshId.value = meshId;
    selectedVertexIndex.value = vertexIndex;
  }

  function clearMeshVertexSelection() {
    selectedMeshId.value = null;
    selectedVertexIndex.value = null;
  }

  function selectMeshOnly(meshId: string) {
    selectedMeshId.value = meshId;
    selectedVertexIndex.value = null;
  }

  /** Plain snapshot for undo/redo; `structuredClone` cannot clone Vue reactive proxies. */
  function cloneProjectPlain(): EditorProject {
    return structuredClone(toRaw(project.value));
  }

  /**
   * Generate/update `rig_slice_*` meshes from the character rig once every slice with pixels is bound.
   * Not an undo step (side effect after commands / load / save).
   */
  function mergeCharacterRigMeshesForPersist(): void {
    const raw = toRaw(project.value);
    if (!characterRigBindingsComplete(raw)) return;
    const synced = applyCommand(raw, { type: "syncCharacterRigSkinnedMeshes" });
    if (synced !== raw) {
      project.value = synced;
      ensureMeshVertexSelection();
    }
  }

  function dispatch(cmd: Command): boolean {
    if (characterRigDraftProject.value !== null) {
      return dispatchToDraft(cmd);
    }
    const cur = toRaw(project.value);
    const toApply = augmentCommand(cmd);
    const next = applyCommand(cur, toApply);
    // If the command produced no changes, do not create an undo step and report failure.
    if (next === cur) return false;
    const issues = validateEditorProject(next);
    if (issues.length > 0) {
      console.warn("Skelio: command rejected", issues);
      return false;
    }
    past.value.push(cloneProjectPlain());
    if (past.value.length > MAX_UNDO) past.value.shift();
    future.value = [];
    project.value = next;
    afterProjectCommit(next, toApply);
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
    return true;
  }

  function undo() {
    if (characterRigDraftProject.value !== null) {
      draftUndo();
      return;
    }
    const prev = past.value.pop();
    if (!prev) return;
    future.value.push(cloneProjectPlain());
    project.value = prev;
    syncActiveCharacterIdFromProject(prev);
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function redo() {
    if (characterRigDraftProject.value !== null) {
      draftRedo();
      return;
    }
    const nxt = future.value.pop();
    if (!nxt) return;
    past.value.push(cloneProjectPlain());
    project.value = nxt;
    syncActiveCharacterIdFromProject(nxt);
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function newProject() {
    past.value = [];
    future.value = [];
    project.value = createDefaultEditorProject();
    syncActiveCharacterIdFromProject(project.value);
    currentTime.value = 0;
    playing.value = false;
    selectedBoneId.value = project.value.bones[0]!.id;
    selectedMeshId.value = null;
    selectedVertexIndex.value = null;
    selectedCharacterRigSliceId.value = null;
    weightBrushEnabled.value = false;
    placeNewBonesAtParentTip.value = true;
    projectRootPath.value = null;
    characterRigDraftProject.value = null;
    characterRigDraftPast.value = [];
    characterRigDraftFuture.value = [];
  }

  function loadProjectData(data: EditorProject, folderRoot: string | null) {
    normalizeEditorProjectInPlace(data);
    const issues = validateEditorProject(data);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    past.value = [];
    future.value = [];
    project.value = data;
    syncActiveCharacterIdFromProject(data);
    currentTime.value = 0;
    playing.value = false;
    projectRootPath.value = folderRoot;
    characterRigDraftProject.value = null;
    characterRigDraftPast.value = [];
    characterRigDraftFuture.value = [];
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function loadFromJson(text: string) {
    const data = JSON.parse(text) as EditorProject;
    loadProjectData(data, null);
  }

  /** Load project folder (absolute path) and `project.skelio.json` — desktop (Tauri) only. */
  async function openProjectFolder(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Folder projects are only supported in the desktop app (Tauri).");
    }
    const root = await pickProjectRootFolder(projectRootPath.value);
    if (!root) return;
    const text = await readProjectManifest(root);
    const raw = JSON.parse(text) as EditorProject;
    const data = await hydrateEditorProjectFromFolder(raw, (rel) => readProjectSubpath(root, rel));
    loadProjectData(data, root);
  }

  /** Save current project to its folder; prompt for folder if none is set. */
  async function saveProjectToFolder(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Folder projects are only supported in the desktop app (Tauri).");
    }
    let root = projectRootPath.value;
    if (!root) {
      root = await pickProjectRootFolder(null);
      if (!root) return;
      projectRootPath.value = root;
    }
    await persistProjectToFolder(root);
  }

  /** Pick a different folder path and save there. */
  async function saveProjectToFolderAs(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Folder projects are only supported in the desktop app (Tauri).");
    }
    const root = await pickProjectRootFolder(projectRootPath.value);
    if (!root) return;
    projectRootPath.value = root;
    await persistProjectToFolder(root);
  }

  /** Manifest + `assets/meshes/*.skelio-mesh.json` (Tauri). */
  async function persistProjectToFolder(root: string): Promise<void> {
    const persist = activeProjectForPersistence();
    const issues = validateEditorProject(persist);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    const { manifest, meshAssetFiles } = dehydrateEditorProjectForFolder(persist);
    for (const f of meshAssetFiles) {
      await writeProjectSubpath(root, f.relativePath, f.content);
    }
    await writeProjectManifest(root, JSON.stringify(manifest, null, 2));
  }

  function saveEditorJson(): string {
    const persist = activeProjectForPersistence();
    return JSON.stringify(stripMeshAssetPaths(persist), null, 2);
  }

  function saveRuntimeJson(): string {
    const persist = activeProjectForPersistence();
    return JSON.stringify(editorProjectToRuntime(persist), null, 2);
  }

  function cleanupCharacterRigModalUi() {
    characterRigModalOpen.value = false;
    sheetSliceModalOpen.value = false;
    sheetSliceModalSheetId.value = null;
    characterRigModalStep.value = 0;
    pendingBonePlacementId.value = null;
    rigCameraViewKind.value = "2d";
  }

  /** Close wizard without merging into Animate (× / Esc / switch workspace to Animate). */
  function discardCharacterRigModal() {
    characterRigDraftProject.value = null;
    characterRigDraftPast.value = [];
    characterRigDraftFuture.value = [];
    cleanupCharacterRigModalUi();
    syncActiveCharacterIdFromProject(project.value);
  }

  /** Merge draft into committed `project` after successful wizard **Done**. */
  function applyCharacterRigModal() {
    const draft = characterRigDraftProject.value;
    if (!draft) {
      cleanupCharacterRigModalUi();
      return;
    }
    past.value.push(cloneProjectPlain());
    future.value = [];
    project.value = structuredClone(toRaw(draft));
    syncActiveCharacterIdFromProject(project.value);
    characterRigDraftProject.value = null;
    characterRigDraftPast.value = [];
    characterRigDraftFuture.value = [];
    cleanupCharacterRigModalUi();
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function openCharacterRigModal() {
    quickRigMode.value = false;
    /** Setup is rigging, not animation — avoid viewport/timeline coupling from Animate mode. */
    if (workspaceMode.value !== "rig") {
      workspaceMode.value = "rig";
    }
    characterRigDraftProject.value = cloneProjectPlain();
    syncActiveCharacterIdFromProject(characterRigDraftProject.value);
    characterRigDraftPast.value = [];
    characterRigDraftFuture.value = [];
    characterRigModalOpen.value = true;
  }

  function setQuickRigMode(on: boolean) {
    quickRigMode.value = on;
  }

  /** @deprecated Prefer `discardCharacterRigModal` or `applyCharacterRigModal`. */
  function closeCharacterRigModal() {
    discardCharacterRigModal();
  }

  function setRigCameraViewKind(kind: RigCameraViewKind) {
    rigCameraViewKind.value = kind;
  }

  function openSheetSliceModal(sheetId: string) {
    sheetSliceModalSheetId.value = sheetId;
    sheetSliceModalOpen.value = true;
  }

  function closeSheetSliceModal() {
    sheetSliceModalOpen.value = false;
    sheetSliceModalSheetId.value = null;
  }

  function selectCharacterRigSlice(id: string | null) {
    selectedCharacterRigSliceId.value = id;
  }

  function selectBone(boneId: string) {
    if (!rigEditProject.value.bones.some((b) => b.id === boneId)) return;
    selectedBoneId.value = boneId;
  }

  function setCharacterRigModalStep(n: number) {
    characterRigModalStep.value = n;
  }

  function setPendingBonePlacement(boneId: string | null) {
    pendingBonePlacementId.value = boneId;
  }

  function setPlaceNewBonesAtParentTip(v: boolean) {
    placeNewBonesAtParentTip.value = v;
  }

  function setAnimatorRigMeshDeformOverlay(v: boolean) {
    animatorRigMeshDeformOverlay.value = v;
  }

  function setAnimatorDeformMeshDraw(v: boolean) {
    animatorDeformMeshDraw.value = v;
  }

  function setWorkspaceMode(m: WorkspaceMode) {
    // Animate mode must never be "bind-pose editing by accident".
    // When switching back to Animate, close setup/rig authoring affordances.
    if (m === "animate") {
      quickRigMode.value = false;
      if (characterRigModalOpen.value) {
        discardCharacterRigModal();
      }
    }
    workspaceMode.value = m;
  }

  syncActiveCharacterIdFromProject(project.value);

  return {
    project,
    /** Bones / rig / meshes: wizard draft while Character Setup is open, else `project`. */
    rigEditProject,
    activeCharacterId,
    activeCharacterRig,
    rigCharacterSlots,
    setActiveCharacterId,
    characterRigBindingsCompleteStrict,
    projectRootPath,
    past,
    future,
    currentTime,
    playing,
    selectedBoneId,
    selectedBone,
    selectedMeshId,
    selectedVertexIndex,
    weightBrushEnabled,
    weightBrushRadius,
    weightBrushStrength,
    weightBrushSubtract,
    selectMeshVertex,
    selectMeshOnly,
    clearMeshVertexSelection,
    ensureMeshVertexSelection,
    dispatch,
    undo,
    redo,
    newProject,
    loadFromJson,
    openProjectFolder,
    saveProjectToFolder,
    saveProjectToFolderAs,
    saveEditorJson,
    saveRuntimeJson,
    characterRigModalOpen,
    openCharacterRigModal,
    discardCharacterRigModal,
    applyCharacterRigModal,
    closeCharacterRigModal,
    quickRigMode,
    setQuickRigMode,
    workspaceMode,
    setWorkspaceMode,
    sheetSliceModalOpen,
    sheetSliceModalSheetId,
    openSheetSliceModal,
    closeSheetSliceModal,
    selectedCharacterRigSliceId,
    selectCharacterRigSlice,
    selectBone,
    characterRigModalStep,
    setCharacterRigModalStep,
    pendingBonePlacementId,
    setPendingBonePlacement,
    placeNewBonesAtParentTip,
    setPlaceNewBonesAtParentTip,
    animatorRigMeshDeformOverlay,
    setAnimatorRigMeshDeformOverlay,
    animatorDeformMeshDraw,
    setAnimatorDeformMeshDraw,
    rigCameraViewKind,
    rigCameraWorldYScale,
    setRigCameraViewKind,
    ensureSelection,
    /** Manifest file name (UI label). */
    projectManifestFileName: PROJECT_MANIFEST_FILE,
  };
});
