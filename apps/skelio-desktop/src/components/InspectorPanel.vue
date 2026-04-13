<script setup lang="ts">
import { normalizeInfluenceRow } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const {
  selectedBone,
  project,
  selectedBoneId,
  selectedMeshId,
  selectedVertexIndex,
  weightBrushEnabled,
  weightBrushRadius,
  weightBrushStrength,
  weightBrushSubtract,
} = storeToRefs(store);

const weightContext = computed(() => {
  const mid = selectedMeshId.value;
  const vi = selectedVertexIndex.value;
  if (mid === null || vi === null) return null;
  const mesh = project.value.skinnedMeshes?.find((m) => m.id === mid);
  if (!mesh || vi < 0 || vi >= mesh.vertices.length) return null;
  return { mesh, vi };
});

const influenceSum = computed(() => {
  const ctx = weightContext.value;
  if (!ctx) return 0;
  return (ctx.mesh.influences[ctx.vi] ?? []).reduce((s, x) => s + x.weight, 0);
});

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

function weightFor(boneId: string): number {
  const ctx = weightContext.value;
  if (!ctx) return 0;
  return ctx.mesh.influences[ctx.vi]?.find((i) => i.boneId === boneId)?.weight ?? 0;
}

function setBoneWeight(boneId: string, ev: Event) {
  const ctx = weightContext.value;
  if (!ctx) return;
  const raw = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(raw)) return;
  const w = Math.max(0, Math.min(1, raw));
  const row = [...(ctx.mesh.influences[ctx.vi] ?? [])];
  const i = row.findIndex((x) => x.boneId === boneId);
  if (w <= 1e-8) {
    if (i >= 0) row.splice(i, 1);
  } else if (i >= 0) {
    row[i] = { boneId, weight: w };
  } else {
    row.push({ boneId, weight: w });
  }
  store.dispatch({
    type: "setMeshVertexInfluences",
    meshId: ctx.mesh.id,
    vertexIndex: ctx.vi,
    influences: row,
  });
}

function normalizeWeights() {
  const ctx = weightContext.value;
  if (!ctx) return;
  const boneIds = new Set(project.value.bones.map((b) => b.id));
  const row = normalizeInfluenceRow(ctx.mesh.influences[ctx.vi] ?? [], boneIds);
  store.dispatch({
    type: "setMeshVertexInfluences",
    meshId: ctx.mesh.id,
    vertexIndex: ctx.vi,
    influences: row,
  });
}

function fullWeightToSelectedBone() {
  const ctx = weightContext.value;
  const bid = selectedBoneId.value;
  if (!ctx || !bid) return;
  store.dispatch({
    type: "setMeshVertexInfluences",
    meshId: ctx.mesh.id,
    vertexIndex: ctx.vi,
    influences: [{ boneId: bid, weight: 1 }],
  });
}

function setIkEnabled(chainId: string, e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  store.dispatch({ type: "setIkChainEnabled", chainId, enabled: on });
}

function setIkTarget(chainId: string, axis: "x" | "y", e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isNaN(v)) return;
  const ch = project.value.ikTwoBoneChains?.find((c) => c.id === chainId);
  if (!ch) return;
  store.dispatch({
    type: "setIkChainTarget",
    chainId,
    targetX: axis === "x" ? v : ch.targetX,
    targetY: axis === "y" ? v : ch.targetY,
  });
}

function removeIkChain(chainId: string) {
  store.dispatch({ type: "removeIkChain", chainId });
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

    <template v-if="project.skinnedMeshes?.length">
      <h3>Pinsel</h3>
      <label class="rowchk">
        <input v-model="weightBrushEnabled" type="checkbox" />
        Pinsel-Modus
      </label>
      <label class="lbl">Radius <input v-model.number="weightBrushRadius" class="inp sm" type="number" min="8" max="220" step="4" /></label>
      <label class="lbl">Stärke <input v-model.number="weightBrushStrength" class="inp sm" type="number" min="0.01" max="0.35" step="0.01" /></label>
      <label class="rowchk">
        <input v-model="weightBrushSubtract" type="checkbox" />
        Subtrahieren
      </label>
      <p class="muted small">Knochen in der Hierarchy wählen. Mesh: Eintrag unter „Meshes“ oder sonst das erste.</p>

      <h3>Gewichte</h3>
      <p v-if="!weightContext" class="muted small">
        Mesh in der Liste wählen, dann einen Vertex im Viewport anklicken.
      </p>
      <template v-else>
        <p class="small meshline">
          <strong>{{ weightContext.mesh.name }}</strong> · Vertex {{ weightContext.vi }}
          <span class="sum" :class="{ warn: influenceSum > 1 + 1e-3 }">Σ {{ influenceSum.toFixed(3) }}</span>
        </p>
        <div class="btnrow">
          <button type="button" class="mini" title="Gewichte so skalieren, dass die Summe 1 ist" @click="normalizeWeights">Normalisieren</button>
          <button type="button" class="mini" title="100% auf den aktuell gewählten Knochen (Hierarchy)" @click="fullWeightToSelectedBone">100% Knochen</button>
        </div>
        <div v-for="b in project.bones" :key="b.id" class="wrow">
          <label class="wlbl">{{ b.name }}</label>
          <input
            class="inp wnum"
            type="number"
            min="0"
            max="1"
            step="0.05"
            :value="weightFor(b.id)"
            @change="setBoneWeight(b.id, $event)"
          />
        </div>
      </template>
    </template>

    <template v-if="project.ikTwoBoneChains?.length">
      <h3>IK (Spike)</h3>
      <p class="muted small">FABRIK auf Gelenkpositionen; Skinning bleibt FK.</p>
      <div v-for="ch in project.ikTwoBoneChains" :key="ch.id" class="ikblock">
        <div class="iktitle">{{ ch.name }}</div>
        <label class="rowchk">
          <input type="checkbox" :checked="ch.enabled" @change="setIkEnabled(ch.id, $event)" />
          Aktiv
        </label>
        <label class="lbl">Ziel X <input class="inp sm" type="number" step="1" :value="ch.targetX" @change="setIkTarget(ch.id, 'x', $event)" /></label>
        <label class="lbl">Ziel Y <input class="inp sm" type="number" step="1" :value="ch.targetY" @change="setIkTarget(ch.id, 'y', $event)" /></label>
        <button type="button" class="mini" @click="removeIkChain(ch.id)">Kette entfernen</button>
      </div>
    </template>
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
.inp.wnum {
  max-width: 4.5rem;
  flex-shrink: 0;
}
.muted {
  color: #666;
  font-size: 0.85rem;
}
.muted.small,
.small {
  font-size: 0.72rem;
  line-height: 1.35;
}
.meshline {
  margin: 0 0 0.4rem;
  color: #bbb;
}
.sum {
  margin-left: 0.35rem;
  color: #9ca3af;
}
.sum.warn {
  color: #f87171;
}
.btnrow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-bottom: 0.5rem;
}
.mini {
  padding: 0.25rem 0.45rem;
  font-size: 0.72rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2c32;
  color: #e5e7eb;
  cursor: pointer;
}
.mini:hover {
  background: #363a42;
}
.wrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  margin-bottom: 0.3rem;
}
.wlbl {
  font-size: 0.72rem;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.rowchk {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: #bbb;
  margin-bottom: 0.45rem;
  cursor: pointer;
  user-select: none;
}
.rowchk input {
  cursor: pointer;
}
.ikblock {
  border: 1px solid #333;
  border-radius: 6px;
  padding: 0.4rem 0.45rem;
  margin-bottom: 0.5rem;
}
.iktitle {
  font-size: 0.78rem;
  color: #c4b5fd;
  margin-bottom: 0.35rem;
}
</style>
