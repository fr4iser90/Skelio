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
      <div class="viewport-slot" :class="{ 'viewport-slot--setup-wizard-open': characterRigModalOpen }">
        <ViewportPanel />
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
  min-height: 0;
  overflow: hidden;
  font-family: system-ui, -apple-system, sans-serif;
  background: #0f1014;
  color: #e6e6e6;
}
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 248px) minmax(0, 1fr) minmax(0, 300px);
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
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
/* Wizard overlay (Teleport, z-index 1000) blocks interaction; this avoids rare hit-target leaks. */
.viewport-slot--setup-wizard-open {
  pointer-events: none;
}
.side {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.45rem 0.55rem;
  border-right: 1px solid #2a2f3a;
  overflow: hidden;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: #3d4454 #15171c;
  background: linear-gradient(165deg, #1a1c24 0%, #14161c 55%, #12141a 100%);
  box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.25);
}
.side > * {
  flex: 1;
  min-height: 0;
  min-width: 0;
}
.side.right {
  border-right: none;
  border-left: 1px solid #2a2f3a;
  box-shadow: inset 1px 0 0 rgba(0, 0, 0, 0.25);
}
</style>
