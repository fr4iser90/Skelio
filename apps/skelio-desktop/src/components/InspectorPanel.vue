<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const { selectedBone, project } = storeToRefs(store);

function rename(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  const id = selectedBone.value?.id;
  if (!id) return;
  store.dispatch({ type: "renameBone", boneId: id, name: v });
}

function patchBind(field: "x" | "y" | "rotation" | "sx" | "sy", ev: Event) {
  const id = selectedBone.value?.id;
  if (!id) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({ type: "setBindPose", boneId: id, partial: { [field]: n } });
}

function patchMeta(ev: Event) {
  store.dispatch({ type: "setMetaName", name: (ev.target as HTMLInputElement).value });
}

function patchFps(ev: Event) {
  const n = Number((ev.target as HTMLInputElement).value);
  if (!Number.isNaN(n)) store.dispatch({ type: "setFps", fps: n });
}
</script>

<template>
  <div class="panel">
    <h3>Projekt</h3>
    <label class="lbl">Name <input class="inp" :value="project.meta.name" @change="patchMeta" /></label>
    <label class="lbl">FPS <input class="inp sm" type="number" min="1" :value="project.meta.fps" @change="patchFps" /></label>

    <template v-if="selectedBone">
      <h3>Knochen</h3>
      <label class="lbl">Name <input class="inp" :value="selectedBone.name" @change="rename" /></label>
      <label class="lbl">Bind X <input class="inp sm" type="number" step="0.1" :value="selectedBone.bindPose.x" @change="patchBind('x', $event)" /></label>
      <label class="lbl">Bind Y <input class="inp sm" type="number" step="0.1" :value="selectedBone.bindPose.y" @change="patchBind('y', $event)" /></label>
      <label class="lbl">Rotation (rad) <input class="inp sm" type="number" step="0.01" :value="selectedBone.bindPose.rotation" @change="patchBind('rotation', $event)" /></label>
      <label class="lbl">Scale X <input class="inp sm" type="number" step="0.05" :value="selectedBone.bindPose.sx" @change="patchBind('sx', $event)" /></label>
      <label class="lbl">Scale Y <input class="inp sm" type="number" step="0.05" :value="selectedBone.bindPose.sy" @change="patchBind('sy', $event)" /></label>
    </template>
    <p v-else class="muted">Kein Knochen gewählt</p>
  </div>
</template>

<style scoped>
.panel {
  padding: 0.5rem 0.65rem;
}
h3 {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
}
h3:first-child {
  margin-top: 0;
}
.lbl {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 0.45rem;
}
.inp {
  padding: 0.35rem 0.45rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #18191c;
  color: #eee;
}
.inp.sm {
  max-width: 7rem;
}
.muted {
  color: #666;
  font-size: 0.85rem;
}
</style>
