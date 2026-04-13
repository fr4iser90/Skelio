<script setup lang="ts">
import { clipDurationSeconds } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";

const emit = defineEmits<{ setPlaying: [v: boolean] }>();

const store = useEditorStore();
const { project, currentTime, playing, selectedBone } = storeToRefs(store);

const duration = computed(() => {
  const clip = project.value.clips.find((c) => c.id === project.value.activeClipId);
  if (!clip) return 4;
  return Math.max(1, clipDurationSeconds(clip, project.value.bones));
});

function addKey(prop: "tx" | "ty" | "rot") {
  const b = selectedBone.value;
  if (!b) return;
  const t = currentTime.value;
  let v = b.bindPose.x;
  if (prop === "ty") v = b.bindPose.y;
  if (prop === "rot") v = b.bindPose.rotation;
  store.dispatch({ type: "addKeyframe", boneId: b.id, property: prop, t, v });
}

function keysFor(prop: "tx" | "ty" | "rot") {
  const clip = project.value.clips.find((c) => c.id === project.value.activeClipId);
  if (!clip || !selectedBone.value) return [];
  const tr = clip.tracks.find((x) => x.boneId === selectedBone.value!.id);
  if (!tr) return [];
  const ch = tr.channels.find((c) => c.property === prop);
  return ch?.keys ?? [];
}
</script>

<template>
  <footer class="tl">
    <div class="row1">
      <label class="time">
        Zeit (s)
        <input v-model.number="currentTime" type="range" min="0" :max="duration" step="0.01" />
      </label>
      <span class="val">{{ currentTime.toFixed(2) }} / {{ duration.toFixed(2) }}</span>
      <button type="button" @click="emit('setPlaying', !playing)">{{ playing ? "Pause" : "Play" }}</button>
    </div>
    <div v-if="selectedBone" class="row2">
      <span class="lab">Keyframes für {{ selectedBone.name }}:</span>
      <button type="button" @click="addKey('tx')">+ Key TX</button>
      <button type="button" @click="addKey('ty')">+ Key TY</button>
      <button type="button" @click="addKey('rot')">+ Key Rot</button>
      <span class="keys">TX: {{ keysFor("tx").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
      <span class="keys">TY: {{ keysFor("ty").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
      <span class="keys">R: {{ keysFor("rot").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
    </div>
    <p v-else class="muted">Knochen wählen, um Keys zu setzen</p>
  </footer>
</template>

<style scoped>
.tl {
  border-top: 1px solid #333;
  padding: 0.5rem 0.75rem;
  background: #1e1f24;
  font-size: 0.85rem;
}
.row1 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}
.time {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #999;
  font-size: 0.75rem;
}
.time input {
  width: 100%;
}
.val {
  font-variant-numeric: tabular-nums;
  color: #bbb;
  min-width: 8rem;
}
button {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  color: inherit;
  cursor: pointer;
}
.row2 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.lab {
  color: #888;
  margin-right: 0.25rem;
}
.keys {
  color: #6b7280;
  font-size: 0.75rem;
}
.muted {
  color: #555;
  margin: 0;
}
</style>
