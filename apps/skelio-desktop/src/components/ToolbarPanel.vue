<script setup lang="ts">
import { ref } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const fileInput = ref<HTMLInputElement | null>(null);

function triggerLoad() {
  fileInput.value?.click();
}
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      store.loadFromJson(String(r.result));
    } catch (err) {
      alert(String(err));
    }
  };
  r.readAsText(f);
  (e.target as HTMLInputElement).value = "";
}

function download(name: string, body: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <header class="bar">
    <strong class="brand">Skelio</strong>
    <button type="button" @click="store.newProject()">Neu</button>
    <button type="button" @click="triggerLoad">Laden…</button>
    <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFile" />
    <button type="button" @click="download(`${store.project.meta.name || 'project'}.skelio.json`, store.saveEditorJson())">
      Speichern (Editor)
    </button>
    <button type="button" @click="download(`${store.project.meta.name || 'export'}-runtime.json`, store.saveRuntimeJson())">
      Export Runtime
    </button>
    <span class="sp" />
    <button type="button" @click="store.undo()">Undo</button>
    <button type="button" @click="store.redo()">Redo</button>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #333;
  background: #25262b;
}
.brand {
  margin-right: 0.5rem;
  color: #a5b4fc;
}
button {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  color: inherit;
  cursor: pointer;
}
button:hover {
  background: #3b3f48;
}
.sp {
  flex: 1;
}
.hidden {
  display: none;
}
</style>
