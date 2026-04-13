import { applyCommand, type Command } from "@skelio/application";
import {
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
  promptProjectRootPath,
  readProjectManifest,
  readProjectSubpath,
  writeProjectManifest,
  writeProjectSubpath,
} from "../tauriProjectFs.js";

const MAX_UNDO = 80;

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

  /** Character Rig: Viewport + Schritte + Sprite-Import. */
  const characterRigModalOpen = ref(false);

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

  function dispatch(cmd: Command) {
    const next = applyCommand(toRaw(project.value), cmd);
    const issues = validateEditorProject(next);
    if (issues.length > 0) {
      console.warn("Skelio: command rejected", issues);
      return;
    }
    past.value.push(cloneProjectPlain());
    if (past.value.length > MAX_UNDO) past.value.shift();
    future.value = [];
    project.value = next;
    ensureSelection();
    ensureMeshVertexSelection();
  }

  function undo() {
    const prev = past.value.pop();
    if (!prev) return;
    future.value.push(cloneProjectPlain());
    project.value = prev;
    ensureSelection();
    ensureMeshVertexSelection();
  }

  function redo() {
    const nxt = future.value.pop();
    if (!nxt) return;
    past.value.push(cloneProjectPlain());
    project.value = nxt;
    ensureSelection();
    ensureMeshVertexSelection();
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
    const root = promptProjectRootPath(
      `Absoluter Pfad zum Ordner mit ${PROJECT_MANIFEST_FILE}:`,
      projectRootPath.value,
    );
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
      root = promptProjectRootPath(`Ordner für ${PROJECT_MANIFEST_FILE} (absoluter Pfad):`);
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
    const root = promptProjectRootPath(
      `Zielordner für ${PROJECT_MANIFEST_FILE} (absoluter Pfad):`,
      projectRootPath.value,
    );
    if (!root) return;
    projectRootPath.value = root;
    await persistProjectToFolder(root);
  }

  /** Manifest + `assets/meshes/*.skelio-mesh.json` (Tauri). */
  async function persistProjectToFolder(root: string): Promise<void> {
    const issues = validateEditorProject(project.value);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    const { manifest, meshAssetFiles } = dehydrateEditorProjectForFolder(toRaw(project.value));
    for (const f of meshAssetFiles) {
      await writeProjectSubpath(root, f.relativePath, f.content);
    }
    await writeProjectManifest(root, JSON.stringify(manifest, null, 2));
  }

  function saveEditorJson(): string {
    return JSON.stringify(stripMeshAssetPaths(toRaw(project.value)), null, 2);
  }

  function saveRuntimeJson(): string {
    return JSON.stringify(editorProjectToRuntime(toRaw(project.value)), null, 2);
  }

  function openCharacterRigModal() {
    characterRigModalOpen.value = true;
  }

  function closeCharacterRigModal() {
    characterRigModalOpen.value = false;
  }

  function selectCharacterRigSlice(id: string | null) {
    selectedCharacterRigSliceId.value = id;
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
    selectedCharacterRigSliceId,
    selectCharacterRigSlice,
    ensureSelection,
    /** Manifest-Dateiname (für UI). */
    projectManifestFileName: PROJECT_MANIFEST_FILE,
  };
});
