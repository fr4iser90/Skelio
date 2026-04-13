import { applyCommand, type Command } from "@skelio/application";
import {
  createDefaultEditorProject,
  editorProjectToRuntime,
  validateEditorProject,
  type EditorProject,
} from "@skelio/domain";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const MAX_UNDO = 80;

export const useEditorStore = defineStore("editor", () => {
  const project = ref<EditorProject>(createDefaultEditorProject());
  const past = ref<EditorProject[]>([]);
  const future = ref<EditorProject[]>([]);
  const currentTime = ref(0);
  const playing = ref(false);
  const selectedBoneId = ref<string | null>(project.value.bones[0]!.id);

  const selectedBone = computed(() =>
    project.value.bones.find((b) => b.id === selectedBoneId.value) ?? null,
  );

  function ensureSelection() {
    if (!selectedBoneId.value || !project.value.bones.some((b) => b.id === selectedBoneId.value)) {
      selectedBoneId.value = project.value.bones[0]?.id ?? null;
    }
  }

  function dispatch(cmd: Command) {
    const next = applyCommand(project.value, cmd);
    const issues = validateEditorProject(next);
    if (issues.length > 0) {
      console.warn("Skelio: command rejected", issues);
      return;
    }
    past.value.push(structuredClone(project.value));
    if (past.value.length > MAX_UNDO) past.value.shift();
    future.value = [];
    project.value = next;
    ensureSelection();
  }

  function undo() {
    const prev = past.value.pop();
    if (!prev) return;
    future.value.push(structuredClone(project.value));
    project.value = prev;
    ensureSelection();
  }

  function redo() {
    const nxt = future.value.pop();
    if (!nxt) return;
    past.value.push(structuredClone(project.value));
    project.value = nxt;
    ensureSelection();
  }

  function newProject() {
    past.value = [];
    future.value = [];
    project.value = createDefaultEditorProject();
    currentTime.value = 0;
    playing.value = false;
    selectedBoneId.value = project.value.bones[0]!.id;
  }

  function loadFromJson(text: string) {
    const data = JSON.parse(text) as EditorProject;
    const issues = validateEditorProject(data);
    if (issues.length) throw new Error(issues.map((i) => i.message).join("; "));
    past.value = [];
    future.value = [];
    project.value = data;
    currentTime.value = 0;
    playing.value = false;
    ensureSelection();
  }

  function saveEditorJson(): string {
    return JSON.stringify(project.value, null, 2);
  }

  function saveRuntimeJson(): string {
    return JSON.stringify(editorProjectToRuntime(project.value), null, 2);
  }

  return {
    project,
    past,
    future,
    currentTime,
    playing,
    selectedBoneId,
    selectedBone,
    dispatch,
    undo,
    redo,
    newProject,
    loadFromJson,
    saveEditorJson,
    saveRuntimeJson,
    ensureSelection,
  };
});
