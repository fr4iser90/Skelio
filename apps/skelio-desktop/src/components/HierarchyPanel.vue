<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const {
  project,
  selectedBoneId,
  selectedMeshId,
  placeNewBonesAtParentTip,
  characterRigModalOpen,
  characterRigModalStep,
  quickRigMode,
} = storeToRefs(store);

/** Skeleton structure: add/remove while Character Setup wizard or Quick Rig. */
const skeletonEditLocked = computed(() => !(characterRigModalOpen.value || quickRigMode.value));

const rows = computed(() => {
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const b of project.value.bones.filter((x) => x.parentId === parentId)) {
      out.push({ id: b.id, name: b.name, depth });
      walk(b.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
});

function select(id: string) {
  selectedBoneId.value = id;
}

function addChild(parentId: string) {
  if (skeletonEditLocked.value) return;
  const n = project.value.bones.filter((x) => x.parentId === parentId).length + 1;
  const nBefore = project.value.bones.length;
  if (
    !store.dispatch({
      type: "addBone",
      parentId,
      name: `bone_${n}`,
      placeAtParentTip: placeNewBonesAtParentTip.value,
    })
  )
    return;
  const placePending =
    quickRigMode.value || (characterRigModalOpen.value && characterRigModalStep.value === 1);
  if (placePending) {
    const nb = project.value.bones;
    if (nb.length > nBefore) {
      const newId = nb[nb.length - 1]!.id;
      store.selectBone(newId);
      store.setPendingBonePlacement(newId);
    }
  }
}

function remove(id: string) {
  if (skeletonEditLocked.value) return;
  store.dispatch({ type: "removeBone", boneId: id });
}

function selectMesh(id: string) {
  store.selectMeshOnly(id);
}
</script>

<template>
  <div class="panel">
    <h3 class="panel-title">Hierarchie</h3>
    <label
      class="pref"
      :title="
        skeletonEditLocked
          ? 'Character Setup oder Quick Rig aktivieren — dann Knochen-Struktur bearbeiten.'
          : undefined
      "
    >
      <input
        type="checkbox"
        :disabled="skeletonEditLocked"
        :checked="placeNewBonesAtParentTip"
        @change="store.setPlaceNewBonesAtParentTip(($event.target as HTMLInputElement).checked)"
      />
      Neu an Parent-Spitze
    </label>
    <ul class="tree">
      <li v-for="row in rows" :key="row.id">
        <div class="row" :class="{ sel: row.id === selectedBoneId }" :style="{ paddingLeft: `${0.4 + row.depth * 0.65}rem` }">
          <button type="button" class="pick" @click="select(row.id)">{{ row.name }}</button>
          <button
            type="button"
            class="mini"
            :disabled="skeletonEditLocked"
            :title="
              skeletonEditLocked
                ? 'Character Setup oder Quick Rig — dann Knochen hinzufügen.'
                : 'Kind'
            "
            @click="addChild(row.id)"
          >
            +
          </button>
          <button
            v-if="project.bones.find((b) => b.id === row.id)?.parentId !== null"
            type="button"
            class="mini danger"
            :disabled="skeletonEditLocked"
            :title="
              skeletonEditLocked ? 'Character Setup oder Quick Rig — dann Knochen entfernen.' : undefined
            "
            @click="remove(row.id)"
          >
            ×
          </button>
        </div>
      </li>
    </ul>
    <template v-if="project.skinnedMeshes?.length">
      <h3>Meshes</h3>
      <ul class="tree">
        <li v-for="m in project.skinnedMeshes" :key="m.id">
          <div class="row" :class="{ sel: m.id === selectedMeshId }">
            <button type="button" class="pick" @click="selectMesh(m.id)">{{ m.name }}</button>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.panel {
  padding: 0.55rem 0.65rem 0.75rem;
}
.panel-title {
  margin: 0 0 0.55rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #2d3340;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #94a3b8;
}
h3 {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #888;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.2rem;
}
.pref {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: #999;
  margin-bottom: 0.45rem;
  cursor: pointer;
}
.row.sel {
  outline: 1px solid #6366f1;
  border-radius: 4px;
}
.pick {
  flex: 1;
  text-align: left;
  padding: 0.25rem 0.35rem;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
}
.pick:hover {
  background: #333;
}
.mini {
  padding: 0.1rem 0.35rem;
  font-size: 0.75rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2c32;
  color: inherit;
  cursor: pointer;
}
.mini.danger {
  border-color: #633;
  color: #f99;
}
</style>
