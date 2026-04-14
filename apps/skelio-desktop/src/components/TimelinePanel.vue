<script setup lang="ts">
import { clipDurationSeconds } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";

const emit = defineEmits<{ setPlaying: [v: boolean] }>();

const store = useEditorStore();
const { project, currentTime, playing, selectedBone } = storeToRefs(store);

const activeClip = computed(() => project.value.clips.find((c) => c.id === project.value.activeClipId));

const duration = computed(() => {
  const clip = activeClip.value;
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
    <div class="tl-head">
      <div class="tl-clip">
        <span class="tl-label">Animation</span>
        <span class="tl-clip-name" :title="activeClip?.name ?? ''">{{ activeClip?.name ?? "—" }}</span>
      </div>
      <button type="button" class="tl-play" @click="emit('setPlaying', !playing)">
        {{ playing ? "Pause" : "Play" }}
      </button>
    </div>
    <div class="row1">
      <label class="time">
        <span class="time-cap">Zeit (s)</span>
        <input v-model.number="currentTime" type="range" min="0" :max="duration" step="0.01" class="tl-range" />
      </label>
      <span class="val">{{ currentTime.toFixed(2) }} / {{ duration.toFixed(2) }}</span>
    </div>
    <div v-if="selectedBone" class="row2">
      <span class="lab">Keys · {{ selectedBone.name }}</span>
      <div class="key-btns">
        <button type="button" class="key-btn" @click="addKey('tx')">+ TX</button>
        <button type="button" class="key-btn" @click="addKey('ty')">+ TY</button>
        <button type="button" class="key-btn" @click="addKey('rot')">+ Rot</button>
      </div>
      <div class="key-list">
        <span class="keys">TX: {{ keysFor("tx").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
        <span class="keys">TY: {{ keysFor("ty").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
        <span class="keys">R: {{ keysFor("rot").map((k) => k.t.toFixed(2)).join(", ") || "—" }}</span>
      </div>
    </div>
    <p v-else class="muted">Knochen in der Hierarchie oder im Viewport wählen — dann Keys oder Ziehen setzt die Pose zur aktuellen Zeit.</p>
  </footer>
</template>

<style scoped>
.tl {
  border-top: 1px solid #2d3340;
  padding: 0.55rem 0.85rem 0.65rem;
  background: linear-gradient(180deg, #1a1d26 0%, #14161c 100%);
  font-size: 0.85rem;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.35);
}
.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.45rem;
  gap: 0.75rem;
}
.tl-clip {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  min-width: 0;
}
.tl-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}
.tl-clip-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: #e2e8f0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-play {
  flex-shrink: 0;
  padding: 0.4rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.45);
  background: linear-gradient(180deg, #4f46e5 0%, #4338ca 100%);
  color: #f8fafc;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);
}
.tl-play:hover {
  filter: brightness(1.06);
}
.row1 {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.45rem;
}
.time {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.time-cap {
  font-size: 0.7rem;
  color: #94a3b8;
}
.tl-range {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  accent-color: #818cf8;
  cursor: pointer;
}
.val {
  font-variant-numeric: tabular-nums;
  color: #cbd5e1;
  min-width: 8.5rem;
  font-size: 0.8rem;
}
.row2 {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.5rem 0.75rem;
}
.lab {
  width: 100%;
  color: #94a3b8;
  font-size: 0.72rem;
  font-weight: 500;
}
.key-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.key-btn {
  padding: 0.28rem 0.55rem;
  border-radius: 6px;
  border: 1px solid #3b4252;
  background: #252830;
  color: #e5e7eb;
  font-size: 0.72rem;
  cursor: pointer;
}
.key-btn:hover {
  border-color: #6366f1;
  color: #c7d2fe;
}
.key-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  width: 100%;
}
.keys {
  color: #64748b;
  font-size: 0.72rem;
}
.muted {
  color: #64748b;
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.4;
}
</style>
