<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";
import AnimatorThreeViewport from "./AnimatorThreeViewport.vue";
import CharacterRigThreeViewport from "./CharacterRigThreeViewport.vue";

type ShortcutLine = { keys: string[]; label: string };

const store = useEditorStore();
const { characterRigModalOpen, rigCameraViewKind, animatorTool, animatorLengthMode } = storeToRefs(store);

const viewportHintLines = computed((): string[] => {
  if (characterRigModalOpen.value) return ["Character Setup (WebGL)"];
  return ["Animate (WebGL)"];
});

const shortcutPanelLines = computed((): ShortcutLine[] => {
  if (characterRigModalOpen.value) return [];
  return [
    { keys: ["R"], label: "Rotate tool" },
    { keys: ["P"], label: "Translate tool" },
    { keys: ["Alt+LMB", "MMB", "RMB"], label: "Camera controls (depending on mode)" },
  ];
});
</script>

<template>
  <div class="viewport">
    <div class="webgl-wrap">
      <CharacterRigThreeViewport v-if="characterRigModalOpen" />
      <AnimatorThreeViewport v-else />
    </div>
    <div class="viewport-left-stack">
      <div v-if="shortcutPanelLines.length > 0" class="kbd-hints" aria-label="Keyboard shortcuts">
        <div v-if="!characterRigModalOpen" class="kbd-active-tool">
          <span class="kbd-active-label">Tool</span>
          <template v-if="animatorLengthMode">
            <span class="kbd-active-name">Length</span>
            <kbd class="kbd-active-key">L</kbd>
          </template>
          <template v-else>
            <span class="kbd-active-name">{{ animatorTool === 'rotate' ? 'Rotate' : 'Translate' }}</span>
            <kbd class="kbd-active-key">{{ animatorTool === 'rotate' ? 'R' : 'P' }}</kbd>
          </template>
        </div>
        <div
          v-for="(line, i) in shortcutPanelLines"
          :key="i"
          class="kbd-line"
          :class="{ 'kbd-line--plain': line.keys.length === 0 }"
        >
          <span v-if="line.keys.length" class="kbd-chips">
            <template v-for="(k, ki) in line.keys" :key="ki">
              <kbd>{{ k }}</kbd>
              <span v-if="ki < line.keys.length - 1" class="kbd-join" aria-hidden="true">·</span>
            </template>
          </span>
          <span class="kbd-desc">{{ line.label }}</span>
        </div>
      </div>
      <div v-if="!characterRigModalOpen" class="cam-modes" aria-label="Camera mode">
        <span class="cam-label">Camera</span>
        <button
          type="button"
          class="cam-btn"
          :class="{ active: rigCameraViewKind === '2d' }"
          title="2D (WebGL)"
          @click="store.setRigCameraViewKind('2d')"
        >
          2D
        </button>
        <button
          type="button"
          class="cam-btn"
          :class="{ active: rigCameraViewKind === '2.5d' }"
          title="2.5D (WebGL)"
          @click="store.setRigCameraViewKind('2.5d')"
        >
          2.5D
        </button>
        <button
          type="button"
          class="cam-btn"
          :class="{ active: rigCameraViewKind === '3d' }"
          title="3D (WebGL)"
          @click="store.setRigCameraViewKind('3d')"
        >
          3D
        </button>
      </div>
      <div class="hint" role="status" aria-live="polite">
        <div v-for="(line, i) in viewportHintLines" :key="i" class="hint-line">{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.webgl-wrap {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.viewport-left-stack {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: min(92vw, 22rem);
  z-index: 3;
  pointer-events: none;
}
.kbd-hints,
.cam-modes,
.hint {
  pointer-events: auto;
}
.kbd-hints {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.94);
  border: 1px solid #343a46;
  color: #b8c0d0;
  font-size: 0.65rem;
  line-height: 1.45;
  width: 100%;
  box-sizing: border-box;
}
.kbd-active-tool {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #2d3340;
}
.kbd-active-label {
  color: #7c8494;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.6rem;
}
.kbd-active-name {
  font-weight: 700;
  color: #e5e7eb;
}
.kbd-active-key {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid #6366f1;
  background: linear-gradient(180deg, #312e52 0%, #252043 100%);
  color: #e0e7ff;
  font-size: 0.68rem;
  font-weight: 700;
}
.kbd-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  margin-top: 4px;
}
.kbd-line:first-of-type {
  margin-top: 0;
}
.kbd-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.kbd-chips kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #3b424e;
  background: #1e2229;
  font-size: 0.62rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #f1f5f9;
}
.kbd-join {
  color: #5c6570;
  font-size: 0.55rem;
  user-select: none;
}
.kbd-desc {
  color: #9ca8b8;
  flex: 1;
  min-width: 8rem;
}
.cam-modes {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
}
.cam-label {
  color: #7c8494;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.6rem;
  margin-right: 4px;
}
.cam-btn {
  appearance: none;
  border: 1px solid #323847;
  background: #171a22;
  color: #cbd5e1;
  padding: 2px 7px;
  border-radius: 6px;
  font-size: 0.65rem;
  cursor: pointer;
}
.cam-btn.active {
  border-color: #6366f1;
  color: #e0e7ff;
  background: #1b1a2a;
}
.hint {
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  color: #9ca8b8;
  font-size: 0.65rem;
  line-height: 1.4;
}
</style>

