<script setup lang="ts">
/**
 * Left column: quick switch between character slots + thumbnail for identification.
 * Thumbnail: first slice with `embedded` image, else first sprite sheet atlas (whole image).
 */
import { getCharacterRig } from "@skelio/domain";
import type { EditorProject } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";

withDefaults(
  defineProps<{
    /** dock: unter der Hierarchie mit fester Max-Höhe; tab: volle Tab-Höhe in der linken Leiste */
    variant?: "dock" | "tab";
  }>(),
  { variant: "dock" },
);

const store = useEditorStore();
const { rigEditProject, rigCharacterSlots, activeCharacterId } = storeToRefs(store);

function thumbDataUrl(p: EditorProject, characterId: string): string | null {
  const rig = getCharacterRig(p, characterId);
  if (!rig) return null;
  for (const s of rig.slices ?? []) {
    const em = s.embedded;
    if (em?.mimeType && em.dataBase64 && (s.width > 0 || s.height > 0)) {
      return `data:${em.mimeType};base64,${em.dataBase64}`;
    }
  }
  const sh = rig.spriteSheets?.[0];
  if (sh?.mimeType && sh.dataBase64) {
    return `data:${sh.mimeType};base64,${sh.dataBase64}`;
  }
  return null;
}

/** Per-slot preview URL (recomputed when rig data changes). */
const thumbByCharacterId = computed(() => {
  const p = rigEditProject.value;
  const o: Record<string, string | null> = {};
  for (const c of rigCharacterSlots.value) {
    o[c.id] = thumbDataUrl(p, c.id);
  }
  return o;
});

function select(id: string) {
  store.setActiveCharacterId(id);
}
</script>

<template>
  <div
    v-if="rigCharacterSlots.length"
    class="strip"
    :class="{ 'strip--tab': variant === 'tab' }"
    aria-label="Characters"
  >
    <h3 class="strip-title">Characters</h3>
    <ul class="list" role="list">
      <li v-for="c in rigCharacterSlots" :key="c.id">
        <button
          type="button"
          class="row"
          :class="{ on: c.id === activeCharacterId }"
          :aria-pressed="c.id === activeCharacterId"
          :title="`Active character: ${c.name}`"
          @click="select(c.id)"
        >
          <span class="thumb-wrap" aria-hidden="true">
            <img v-if="thumbByCharacterId[c.id]" class="thumb" :src="thumbByCharacterId[c.id] ?? ''" alt="" />
            <span v-else class="thumb-fallback">{{ c.name.trim().charAt(0).toUpperCase() || "?" }}</span>
          </span>
          <span class="name">{{ c.name || "Character" }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.strip {
  flex: 0 1 auto;
  min-height: 0;
  max-height: min(38vh, 220px);
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.85rem 0.65rem;
  border-top: 1px solid #2d3340;
  background: linear-gradient(180deg, rgba(20, 22, 28, 0.92) 0%, #12141a 100%);
}
.strip.strip--tab {
  flex: 1;
  max-height: none;
  border-top: none;
}
.strip-title {
  margin: 0 0 0.45rem;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #94a3b8;
  flex-shrink: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  min-height: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  width: 100%;
  margin-bottom: 0.35rem;
  padding: 0.28rem 0.35rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: rgba(30, 32, 40, 0.65);
  color: #e2e8f0;
  font: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.row:hover {
  background: rgba(45, 48, 58, 0.85);
}
.row.on {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(55, 48, 120, 0.35);
}
.thumb-wrap {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  background: #0f1014;
  border: 1px solid #2d3340;
  display: flex;
  align-items: center;
  justify-content: center;
}
.thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}
.thumb-fallback {
  font-size: 0.85rem;
  font-weight: 700;
  color: #818cf8;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
