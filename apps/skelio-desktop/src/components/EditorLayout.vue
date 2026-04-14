<script setup lang="ts">
import { clipDurationSeconds } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted } from "vue";
import { useEditorStore } from "../stores/editor.js";
import HierarchyPanel from "./HierarchyPanel.vue";
import InspectorPanel from "./InspectorPanel.vue";
import TimelinePanel from "./TimelinePanel.vue";
import CharacterRigModal from "./CharacterRigModal.vue";
import SpriteSheetSliceModal from "./SpriteSheetSliceModal.vue";
import ToolbarPanel from "./ToolbarPanel.vue";
import ViewportPanel from "./ViewportPanel.vue";

const store = useEditorStore();
const { project, currentTime, playing, characterRigModalOpen } = storeToRefs(store);

const playMax = computed(() => {
  const clip = project.value.clips.find((c) => c.id === project.value.activeClipId);
  if (!clip) return 4;
  return Math.max(1, clipDurationSeconds(clip, project.value.bones));
});

let raf = 0;
function tick() {
  if (!playing.value) return;
  const dt = 1 / Math.max(1, project.value.meta.fps);
  currentTime.value += dt;
  const max = playMax.value;
  if (currentTime.value > max) currentTime.value = 0;
  raf = requestAnimationFrame(tick);
}

function setPlaying(v: boolean) {
  playing.value = v;
  if (v) raf = requestAnimationFrame(tick);
  else cancelAnimationFrame(raf);
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  cancelAnimationFrame(raf);
});

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  }
}
</script>

<template>
  <div class="shell">
    <ToolbarPanel />
    <div class="workspace">
      <aside class="side">
        <HierarchyPanel />
      </aside>
      <div class="viewport-slot">
        <ViewportPanel v-if="!characterRigModalOpen" />
      </div>
      <aside class="side right">
        <InspectorPanel />
      </aside>
    </div>
    <TimelinePanel @set-playing="setPlaying" />
    <CharacterRigModal />
    <SpriteSheetSliceModal />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: auto 1fr minmax(200px, 240px);
  height: 100vh;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f1014;
  color: #e6e6e6;
}
.workspace {
  display: grid;
  grid-template-columns: 228px 1fr 272px;
  min-height: 0;
  height: 100%;
  align-items: stretch;
  border-bottom: 1px solid #252830;
}
.viewport-slot {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0f1014;
}
.side {
  border-right: 1px solid #2a2f3a;
  overflow: auto;
  background: linear-gradient(180deg, #1c1e26 0%, #181a20 100%);
}
.side.right {
  border-right: none;
  border-left: 1px solid #2a2f3a;
}
</style>
