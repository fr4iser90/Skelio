import { applyCommand, type Command } from "@skelio/application";
import {
  characterRigBindingsComplete,
  createDefaultEditorProject,
  dehydrateEditorProjectForFolder,
  editorProjectToRuntime,
  hydrateEditorProjectFromFolder,
  normalizeEditorProjectInPlace,
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

/** Character-Rig-Viewport: 2D flach vs. leichte Y-Stauchung (kein echtes 3D). */
export type RigCameraViewKind = "2d" | "2.5d" | "3d";

/** Toolbar-Zeile 2: Animate / Rig / Export (alle Aktionen bleiben erreichbar). */
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

  /** Character Setup: geführter Wizard (Viewport + Schritte + Sprite-Import), kein Alltags-Animator. */
  const characterRigModalOpen = ref(false);

  /** Hauptfenster: Bind-Pose / Knochen-Struktur wie Wizard-Schritt „Bones“, ohne Assistenten. */
  const quickRigMode = ref(false);

  const workspaceMode = ref<WorkspaceMode>("animate");

  /** Modal: Region aus Sprite-Sheet in gewählten Slot übernehmen. */
  const sheetSliceModalOpen = ref(false);
  const sheetSliceModalSheetId = ref<string | null>(null);

  /** Character-Setup-Assistent: aktiver Schritt (0–4), für Viewport-Logik im Wizard. */
  const characterRigModalStep = ref(0);
  /** Nächster Klick im Viewport setzt die Position dieses Knochens (BindPose). */
  const pendingBonePlacementId = ref<string | null>(null);

  /** Neu angelegte Kind-Knochen: Bind X/Y an Parent-Spitze (wenn Parent `length` > 0), sonst klassisch (40,0). */
  const placeNewBonesAtParentTip = ref(false);

  /** Animator-Canvas: deformierte `rig_slice_*`-Dreiecke (Skinning) einblenden (2D-Canvas). */
  const animatorRigMeshDeformOverlay = ref(true);

  /**
   * Character-Rig-Slices im 2D-Animator als **texturierte** skinned Meshes zeichnen (Deformation wie Spine),
   * statt nur starrer Rechtecke — wenn `rig_slice_*`-Mesh existiert.
   */
  const animatorDeformMeshDraw = ref(true);

  /** Nur im Character-Setup-Wizard: Kamera-Modus (2D = Ortho; 2.5D/3D = Perspektive). Beim Schließen → 2D. */
  const rigCameraViewKind = ref<RigCameraViewKind>("2d");
  /** Keine Welt-Y-Stauchung mehr (echtes 2.5D/3D über Kamera/Perspektive). */
  const rigCameraWorldYScale = computed(() => 1);

  /** Viewport: ausgewählter Character-Rig-Slice (pixelgenau verschieben). */
  const selectedCharacterRigSliceId = ref<string | null>(null);

  const selectedBone = computed(() =>
    project.value.bones.find((b) => b.id === selectedBoneId.value) ?? null,
  );

  function ensureSelection() {
    if (!selectedBoneId.value || !project.value.bones.some((b) => b.id === selectedBoneId.value)) {
      selectedBoneId.value = project.value.bones[0]?.id ?? null;
    }
  }

  function ensureMeshVertexSelection() {
    const meshes = project.value.skinnedMeshes ?? [];
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
   * `rig_slice_*`-Meshes aus dem Character-Rig erzeugen/aktualisieren, sobald jedes Slice mit Pixeln an einen
   * Knochen gebunden ist. Kein Undo-Eintrag (Side-Effect nach Commands / Laden / Speichern).
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
    const cur = toRaw(project.value);
    const next = applyCommand(cur, cmd);
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
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
    return true;
  }

  function undo() {
    const prev = past.value.pop();
    if (!prev) return;
    future.value.push(cloneProjectPlain());
    project.value = prev;
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function redo() {
    const nxt = future.value.pop();
    if (!nxt) return;
    past.value.push(cloneProjectPlain());
    project.value = nxt;
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function newProject() {
    past.value = [];
    future.value = [];
    project.value = createDefaultEditorProject();
    currentTime.value = 0;
    playing.value = false;
    selectedBoneId.value = project.value.bones[0]!.id;
    selectedMeshId.value = null;
    selectedVertexIndex.value = null;
    selectedCharacterRigSliceId.value = null;
    weightBrushEnabled.value = false;
    placeNewBonesAtParentTip.value = true;
    projectRootPath.value = null;
  }

  function loadProjectData(data: EditorProject, folderRoot: string | null) {
    normalizeEditorProjectInPlace(data);
    const issues = validateEditorProject(data);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    past.value = [];
    future.value = [];
    project.value = data;
    currentTime.value = 0;
    playing.value = false;
    projectRootPath.value = folderRoot;
    ensureSelection();
    ensureMeshVertexSelection();
    mergeCharacterRigMeshesForPersist();
  }

  function loadFromJson(text: string) {
    const data = JSON.parse(text) as EditorProject;
    loadProjectData(data, null);
  }

  /** Projektordner (absoluter Pfad) und `project.skelio.json` laden — nur Tauri. */
  async function openProjectFolder(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Ordnerprojekt nur in der Desktop-App (Tauri).");
    }
    const root = await pickProjectRootFolder(projectRootPath.value);
    if (!root) return;
    const text = await readProjectManifest(root);
    const raw = JSON.parse(text) as EditorProject;
    const data = await hydrateEditorProjectFromFolder(raw, (rel) => readProjectSubpath(root, rel));
    loadProjectData(data, root);
  }

  /** Aktuelles Projekt speichern; ohne bekannten Pfad → Pfad abfragen. */
  async function saveProjectToFolder(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Ordnerprojekt nur in der Desktop-App (Tauri).");
    }
    let root = projectRootPath.value;
    if (!root) {
      root = await pickProjectRootFolder(null);
      if (!root) return;
      projectRootPath.value = root;
    }
    await persistProjectToFolder(root);
  }

  /** Anderen Ordnerpfad wählen und speichern. */
  async function saveProjectToFolderAs(): Promise<void> {
    if (!isTauriApp()) {
      throw new Error("Ordnerprojekt nur in der Desktop-App (Tauri).");
    }
    const root = await pickProjectRootFolder(projectRootPath.value);
    if (!root) return;
    projectRootPath.value = root;
    await persistProjectToFolder(root);
  }

  /** Manifest + `assets/meshes/*.skelio-mesh.json` (Tauri). */
  async function persistProjectToFolder(root: string): Promise<void> {
    mergeCharacterRigMeshesForPersist();
    const issues = validateEditorProject(project.value);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    const { manifest, meshAssetFiles } = dehydrateEditorProjectForFolder(toRaw(project.value));
    for (const f of meshAssetFiles) {
      await writeProjectSubpath(root, f.relativePath, f.content);
    }
    await writeProjectManifest(root, JSON.stringify(manifest, null, 2));
  }

  function saveEditorJson(): string {
    mergeCharacterRigMeshesForPersist();
    return JSON.stringify(stripMeshAssetPaths(toRaw(project.value)), null, 2);
  }

  function saveRuntimeJson(): string {
    mergeCharacterRigMeshesForPersist();
    return JSON.stringify(editorProjectToRuntime(toRaw(project.value)), null, 2);
  }

  function openCharacterRigModal() {
    quickRigMode.value = false;
    characterRigModalOpen.value = true;
  }

  function setQuickRigMode(on: boolean) {
    quickRigMode.value = on;
  }

  function closeCharacterRigModal() {
    characterRigModalOpen.value = false;
    sheetSliceModalOpen.value = false;
    sheetSliceModalSheetId.value = null;
    characterRigModalStep.value = 0;
    pendingBonePlacementId.value = null;
    rigCameraViewKind.value = "2d";
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
    if (!project.value.bones.some((b) => b.id === boneId)) return;
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
        closeCharacterRigModal();
      }
    }
    workspaceMode.value = m;
  }

  return {
    project,
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
    /** Manifest-Dateiname (für UI). */
    projectManifestFileName: PROJECT_MANIFEST_FILE,
  };
});
