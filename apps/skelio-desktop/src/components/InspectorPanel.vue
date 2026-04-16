<script setup lang="ts">
import {
  getLocalBoneState,
  getTwoBoneIkChains,
  normalizeInfluenceRow,
  worldPoseBoneTips,
  worldPoseOrigins,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const {
  selectedBone,
  rigEditProject,
  currentTime,
  selectedBoneId,
  selectedMeshId,
  selectedVertexIndex,
  weightBrushEnabled,
  weightBrushRadius,
  weightBrushStrength,
  weightBrushSubtract,
  placeNewBonesAtParentTip,
  characterRigModalOpen,
  quickRigMode,
  workspaceMode,
} = storeToRefs(store);

/**
 * Bind/Länge nur außerhalb von „reinem“ Animate: Rig-Tab, Character-Setup-Modal oder Quick Rig.
 * (Animate = nur Keys am Playhead, keine Skelett-Restpose — siehe docs/16.)
 */
const bindPoseLocked = computed(
  () =>
    !(
      characterRigModalOpen.value ||
      quickRigMode.value ||
      workspaceMode.value === "rig"
    ),
);

const twoBoneIkChainsShown = computed(() => getTwoBoneIkChains(rigEditProject.value));
const fabrikIkChainsShown = computed(() => rigEditProject.value.rig?.ik?.fabrikChains ?? []);
const ikCreateError = ref<string | null>(null);

/** Rechte Spalte: nur ein Bereich sichtbar → weniger Scroll, klarer als alles untereinander. */
const inspectorTab = ref<"project" | "bone" | "mesh" | "ik">("bone");

const poseRotationAtPlayhead = computed(() => {
  const b = selectedBone.value;
  if (!b) return 0;
  const clip = rigEditProject.value.clips.find((c) => c.id === rigEditProject.value.activeClipId);
  return getLocalBoneState(b, clip, currentTime.value).rot;
});

const weightContext = computed(() => {
  const mid = selectedMeshId.value;
  const vi = selectedVertexIndex.value;
  if (mid === null || vi === null) return null;
  const mesh = rigEditProject.value.skinnedMeshes?.find((m) => m.id === mid);
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
  if (bindPoseLocked.value) return;
  const id = selectedBone.value?.id;
  if (!id) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({ type: "setBindPose", boneId: id, partial: { [field]: n } });
}

function patchBind3d(field: "z" | "depthOffset" | "tilt" | "spin", ev: Event) {
  if (bindPoseLocked.value) return;
  const id = selectedBone.value?.id;
  if (!id) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({ type: "setBindBone3d", boneId: id, partial: { [field]: n } });
}

function bind3d(field: "z" | "depthOffset" | "tilt" | "spin"): number {
  const b = selectedBone.value;
  if (!b?.bindBone3d) return 0;
  return b.bindBone3d[field];
}

/** Keyframe at playhead: sample current pose and write **offset-from-bind** channel values. */
function keyframeChannel(prop: "tz" | "tilt" | "spin" | "rot") {
  const b = selectedBone.value;
  if (!b) return;
  const clip = rigEditProject.value.clips.find((c) => c.id === rigEditProject.value.activeClipId);
  const s = getLocalBoneState(b, clip, currentTime.value);
  const b3 = b.bindBone3d;
  const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
  const v =
    prop === "tz"
      ? s.z - zBase
      : prop === "tilt"
        ? s.tilt - (b3?.tilt ?? 0)
        : prop === "spin"
          ? s.spin - (b3?.spin ?? 0)
          : s.rot - b.bindPose.rotation;
  store.dispatch({
    type: "addKeyframe",
    boneId: b.id,
    property: prop,
    t: currentTime.value,
    v,
  });
}

function patchPoseRotation(ev: Event) {
  const b = selectedBone.value;
  if (!b) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({
    type: "addKeyframe",
    boneId: b.id,
    property: "rot",
    t: currentTime.value,
    v: n - b.bindPose.rotation,
  });
}

function patchBoneLength(ev: Event) {
  if (bindPoseLocked.value) return;
  const id = selectedBone.value?.id;
  if (!id) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n) || n < 0) return;
  store.dispatch({ type: "setBoneLength", boneId: id, length: n });
}

function snapToParentTip() {
  if (bindPoseLocked.value) return;
  const id = selectedBone.value?.id;
  if (!id) return;
  store.dispatch({ type: "snapBoneToParentTip", boneId: id });
}

function setFollowParentTip(ev: Event) {
  if (bindPoseLocked.value) return;
  const id = selectedBone.value?.id;
  if (!id) return;
  const on = (ev.target as HTMLInputElement).checked;
  store.dispatch({ type: "setBoneFollowParentTip", boneId: id, follow: on });
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
  const boneIds = new Set(rigEditProject.value.bones.map((b) => b.id));
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
  const ch = twoBoneIkChainsShown.value.find((c) => c.id === chainId);
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

function setFabrikIkEnabled(chainId: string, e: Event) {
  const on = (e.target as HTMLInputElement).checked;
  store.dispatch({ type: "setFabrikIkChainEnabled", chainId, enabled: on });
}

function setFabrikIkTarget(chainId: string, axis: "x" | "y", e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  if (Number.isNaN(v)) return;
  const ch = fabrikIkChainsShown.value.find((c) => c.id === chainId);
  if (!ch) return;
  store.dispatch({
    type: "setFabrikIkChainTarget",
    chainId,
    targetX: axis === "x" ? v : ch.targetX,
    targetY: axis === "y" ? v : ch.targetY,
  });
}

function removeFabrikIkChain(chainId: string) {
  store.dispatch({ type: "removeFabrikIkChain", chainId });
}

function addFabrikIkFromSelectedTip() {
  ikCreateError.value = null;
  const id = selectedBoneId.value;
  if (!id) return;
  const before = new Set((rigEditProject.value.rig?.ik?.fabrikChains ?? []).map((c) => c.id));
  const ok = store.dispatch({ type: "addFabrikIkChainFromTip", tipBoneId: id, name: "FABRIK-Kette", maxBones: 3 });
  if (!ok) {
    ikCreateError.value = "FABRIK konnte nicht erstellt werden (Kette braucht mind. 3 Knochen: Tip → Parent → Grandparent).";
    return;
  }
  const after = rigEditProject.value.rig?.ik?.fabrikChains ?? [];
  const created = after.find((c) => !before.has(c.id)) ?? null;
  if (!created) {
    ikCreateError.value = "FABRIK wurde nicht angelegt (unerwarteter Zustand).";
    return;
  }

  // Prevent any visible snap: disable → seed target at current pose tip → enable.
  store.dispatch({ type: "setFabrikIkChainEnabled", chainId: created.id, enabled: false });
  const tipPt = worldPoseBoneTips(rigEditProject.value, currentTime.value).get(id);
  if (tipPt) {
    store.dispatch({ type: "setFabrikIkChainTarget", chainId: created.id, targetX: tipPt.x, targetY: tipPt.y });
  }
  store.dispatch({ type: "setFabrikIkChainEnabled", chainId: created.id, enabled: true });
}

function addTwoBoneIkFromSelectedTip() {
  ikCreateError.value = null;
  const tipId = selectedBoneId.value;
  if (!tipId) return;
  const tipBone = rigEditProject.value.bones.find((b) => b.id === tipId) ?? null;
  const mid = tipBone?.parentId ? rigEditProject.value.bones.find((b) => b.id === tipBone.parentId) ?? null : null;
  const root = mid?.parentId ? rigEditProject.value.bones.find((b) => b.id === mid.parentId) ?? null : null;
  if (!tipBone || !mid || !root) {
    ikCreateError.value = "2‑Bone IK braucht eine Parent-Kette aus 3 Knochen: thigh → leg → foot (wähle den Fuß als Tip).";
    return;
  }
  const before = new Set(getTwoBoneIkChains(rigEditProject.value).map((c) => c.id));
  const ok = store.dispatch({ type: "addTwoBoneIkChainFromTip", tipBoneId: tipId, name: "2-Bone IK (Leg)" });
  if (!ok) {
    ikCreateError.value = "2‑Bone IK konnte nicht erstellt werden (Chain existiert evtl. schon oder Auswahl ist kein gültiger Tip).";
    return;
  }
  const after = getTwoBoneIkChains(rigEditProject.value);
  const created = after.find((c) => !before.has(c.id)) ?? null;
  if (!created) {
    ikCreateError.value = "2‑Bone IK wurde nicht angelegt (unerwarteter Zustand).";
    return;
  }

  // Prevent snap: disable → seed target to current pose tip → add control with pole → enable.
  store.dispatch({ type: "setIkChainEnabled", chainId: created.id, enabled: false });
  const tipPt = worldPoseBoneTips(rigEditProject.value, currentTime.value).get(tipId);
  if (tipPt) {
    store.dispatch({ type: "setIkChainTarget", chainId: created.id, targetX: tipPt.x, targetY: tipPt.y });
  }

  // Create a control so we can seed a pole (stable knee direction).
  store.dispatch({ type: "ensureIkTargetControl", chainId: created.id });
  const ctl = rigEditProject.value.rig?.controls?.ikTargets2d?.find((c) => c.chainId === created.id) ?? null;
  if (ctl) {
    const origins = worldPoseOrigins(rigEditProject.value, currentTime.value);
    const rootO = origins.get(created.rootBoneId);
    const midO = origins.get(created.midBoneId);
    // Default pole: push "forward" from the mid joint perpendicular to the root→tip direction.
    if (rootO && midO && tipPt) {
      const dx = tipPt.x - rootO.x;
      const dy = tipPt.y - rootO.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const poleX = midO.x + nx * 60;
      const poleY = midO.y + ny * 60;
      store.dispatch({
        type: "setIkTargetControlBase",
        controlId: ctl.id,
        x: ctl.x,
        y: ctl.y,
        poleX,
        poleY,
      });
    }
  }

  store.dispatch({ type: "setIkChainEnabled", chainId: created.id, enabled: true });
}
</script>

<template>
  <div class="panel">
    <nav class="insp-tabs" role="tablist" aria-label="Eigenschaften">
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': inspectorTab === 'project' }"
        :aria-selected="inspectorTab === 'project'"
        @click="inspectorTab = 'project'"
      >
        Projekt
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': inspectorTab === 'bone' }"
        :aria-selected="inspectorTab === 'bone'"
        @click="inspectorTab = 'bone'"
      >
        Knochen
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': inspectorTab === 'mesh' }"
        :aria-selected="inspectorTab === 'mesh'"
        @click="inspectorTab = 'mesh'"
      >
        Mesh
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': inspectorTab === 'ik' }"
        :aria-selected="inspectorTab === 'ik'"
        @click="inspectorTab = 'ik'"
      >
        IK
      </button>
    </nav>

    <div class="insp-body">
      <section v-show="inspectorTab === 'project'" class="insp-section">
        <h3 class="panel-title">Projekt</h3>
        <label class="lbl">Name <input class="inp" :value="rigEditProject.meta.name" @change="patchMeta" /></label>
        <label class="lbl">FPS <input class="inp sm" type="number" min="1" :value="rigEditProject.meta.fps" @change="patchFps" /></label>
      </section>

      <section v-show="inspectorTab === 'bone'" class="insp-section">
    <template v-if="selectedBone">
      <h3 class="panel-title">Knochen</h3>
      <p v-if="bindPoseLocked" class="bone-hint bone-hint-warn">
        <strong>Rest-Skelett (Länge, Bind X/Y, …)</strong>: im Tab <strong>Rig</strong> hier editierbar, oder
        <strong>Character Setup…</strong> / <strong>Quick Rig</strong>. Im Tab <strong>Animate</strong> absichtlich
        gesperrt — nur Keys am Playhead. Grauer Schaft in der Ansicht: oft <strong>Gelenk → Kindgelenk</strong>; bei Pose/IK
        kann das <strong>kürzer wirken</strong> als die Zahl „Length“ (die Länge am Stab ändert sich nicht durch Drehen).
      </p>
      <p v-else class="bone-hint">
        <strong>Bind pose</strong> = rest skeleton. <strong>Animation</strong> uses keys at time
        <span class="tmono">{{ currentTime.toFixed(2) }}s</span> (timeline or viewport).
      </p>
      <label class="lbl">Name <input class="inp" :value="selectedBone.name" @change="rename" /></label>
      <label class="lbl"
        >Bind X
        <input
          class="inp sm"
          type="number"
          step="0.1"
          :disabled="bindPoseLocked"
          :value="selectedBone.bindPose.x"
          @change="patchBind('x', $event)"
      /></label>
      <label class="lbl"
        >Bind Y
        <input
          class="inp sm"
          type="number"
          step="0.1"
          :disabled="bindPoseLocked"
          :value="selectedBone.bindPose.y"
          @change="patchBind('y', $event)"
      /></label>
      <label class="lbl"
        >Bind rotation (rad)
        <input
          class="inp sm"
          type="number"
          step="0.01"
          :disabled="bindPoseLocked"
          :value="selectedBone.bindPose.rotation"
          @change="patchBind('rotation', $event)"
      /></label>
      <label class="lbl"
        >Length
        <input
          class="inp sm"
          type="number"
          step="0.5"
          min="0"
          :disabled="bindPoseLocked"
          :value="selectedBone.length"
          @change="patchBoneLength($event)"
      /></label>
      <label class="lbl"
        >Scale X
        <input
          class="inp sm"
          type="number"
          step="0.05"
          :disabled="bindPoseLocked"
          :value="selectedBone.bindPose.sx"
          @change="patchBind('sx', $event)"
      /></label>
      <label class="lbl"
        >Scale Y
        <input
          class="inp sm"
          type="number"
          step="0.05"
          :disabled="bindPoseLocked"
          :value="selectedBone.bindPose.sy"
          @change="patchBind('sy', $event)"
      /></label>

      <h4 class="sub-title">3D (Editor, Bind)</h4>
      <p class="muted small">
        Z / depth offset / tilt / spin (radians). See docs/adr/0011-editor-bone-3d-bind-pose.md. Runtime export 1.1.0
        still strips tz/tilt/spin.
      </p>
      <label class="lbl"
        >Bind Z
        <input class="inp sm" type="number" step="0.1" :disabled="bindPoseLocked" :value="bind3d('z')" @change="patchBind3d('z', $event)"
      /></label>
      <label class="lbl"
        >Depth offset
        <input
          class="inp sm"
          type="number"
          step="0.1"
          :disabled="bindPoseLocked"
          :value="bind3d('depthOffset')"
          @change="patchBind3d('depthOffset', $event)"
      /></label>
      <label class="lbl"
        >Tilt (rad)
        <input
          class="inp sm"
          type="number"
          step="0.01"
          :disabled="bindPoseLocked"
          :value="bind3d('tilt')"
          @change="patchBind3d('tilt', $event)"
      /></label>
      <label class="lbl"
        >Spin (rad)
        <input
          class="inp sm"
          type="number"
          step="0.01"
          :disabled="bindPoseLocked"
          :value="bind3d('spin')"
          @change="patchBind3d('spin', $event)"
      /></label>
      <div class="btnrow">
        <button type="button" class="mini" title="Keyframe TZ at current time" @click="keyframeChannel('tz')">Key TZ</button>
        <button type="button" class="mini" title="Keyframe tilt at current time" @click="keyframeChannel('tilt')">Key tilt</button>
        <button type="button" class="mini" title="Keyframe spin at current time" @click="keyframeChannel('spin')">Key spin</button>
      </div>

      <h4 class="sub-title">Animation (playhead)</h4>
      <p class="muted small">
        Pose rotation (FK) at <span class="tmono">{{ currentTime.toFixed(2) }}s</span> — raise arms etc. Viewport drag on
        sprites/bones writes <strong>TX/TY</strong> keys only.
      </p>
      <label class="lbl"
        >Pose rotation (rad)
        <input
          class="inp sm"
          type="number"
          step="0.01"
          :value="poseRotationAtPlayhead"
          @change="patchPoseRotation"
      /></label>
      <div class="btnrow">
        <button type="button" class="mini" title="Keyframe rot at current time" @click="keyframeChannel('rot')">Key rot</button>
      </div>

      <label class="rowchk">
        <input
          type="checkbox"
          :disabled="bindPoseLocked"
          :checked="placeNewBonesAtParentTip"
          @change="store.setPlaceNewBonesAtParentTip(($event.target as HTMLInputElement).checked)"
        />
        Neue Kinder an Parent-Spitze
      </label>
      <template v-if="selectedBone.parentId">
        <div class="btnrow">
          <button type="button" class="mini" :disabled="bindPoseLocked" @click="snapToParentTip">An Spitze schnappen</button>
        </div>
        <label class="rowchk">
          <input
            type="checkbox"
            :disabled="bindPoseLocked"
            :checked="!!selectedBone.followParentTip"
            @change="setFollowParentTip($event)"
          />
          Parent-Spitze folgen
        </label>
      </template>
    </template>
    <p v-else class="muted">Kein Knochen gewählt</p>
      </section>

      <section v-show="inspectorTab === 'mesh'" class="insp-section">
    <template v-if="rigEditProject.skinnedMeshes?.length">
      <h3 class="panel-title">Pinsel</h3>
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

      <h3 class="panel-title">Gewichte</h3>
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
        <div v-for="b in rigEditProject.bones" :key="b.id" class="wrow">
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
    <p v-else class="muted small">Keine skinned Meshes — z. B. Demo-Mesh / OBJ unter Toolbar-Modus <strong>Rig</strong>.</p>
      </section>

      <section v-show="inspectorTab === 'ik'" class="insp-section">
        <h3 class="panel-title">IK</h3>
        <p v-if="ikCreateError" class="muted small" style="color:#fca5a5;">
          {{ ikCreateError }}
        </p>
        <p class="muted small">
          Zwei-Knochen-Ketten und <strong>FABRIK</strong>. Knochen wählen, dann FABRIK anlegen — oder <strong>IK-Demo</strong>
          (Modus <strong>Rig</strong>).
        </p>
        <div v-if="selectedBoneId" class="btnrow">
          <button
            type="button"
            class="mini"
            title="2-Segment IK (3 Knochen): Tip → Parent → Grandparent. Stabiler Knie-/Ellbogen-Pole."
            @click="addTwoBoneIkFromSelectedTip"
          >
            2‑Bone IK aus gewähltem Knochen
          </button>
          <button
            type="button"
            class="mini"
            title="Vom gewählten Knochen bis zur Wurzel: mindestens 3 Knochen als FABRIK-Kette"
            @click="addFabrikIkFromSelectedTip"
          >
            FABRIK aus gewähltem Knochen
          </button>
        </div>
        <p v-else class="muted small">Zuerst einen <strong>Knochen</strong> in der Hierarchy wählen.</p>
        <template v-if="twoBoneIkChainsShown.length || fabrikIkChainsShown.length">
          <div v-for="ch in twoBoneIkChainsShown" :key="'2b-' + ch.id" class="ikblock">
            <div class="iktitle">{{ ch.name }} (2-Segment)</div>
            <label class="rowchk">
              <input type="checkbox" :checked="ch.enabled" @change="setIkEnabled(ch.id, $event)" />
              Aktiv
            </label>
            <label class="lbl">Ziel X <input class="inp sm" type="number" step="1" :value="ch.targetX" @change="setIkTarget(ch.id, 'x', $event)" /></label>
            <label class="lbl">Ziel Y <input class="inp sm" type="number" step="1" :value="ch.targetY" @change="setIkTarget(ch.id, 'y', $event)" /></label>
            <button type="button" class="mini" @click="removeIkChain(ch.id)">Kette entfernen</button>
          </div>
          <div v-for="ch in fabrikIkChainsShown" :key="'fab-' + ch.id" class="ikblock">
            <div class="iktitle">{{ ch.name }} (FABRIK · {{ ch.boneIds.length }} Knochen)</div>
            <label class="rowchk">
              <input type="checkbox" :checked="ch.enabled" @change="setFabrikIkEnabled(ch.id, $event)" />
              Aktiv
            </label>
            <label class="lbl">Ziel X <input class="inp sm" type="number" step="1" :value="ch.targetX" @change="setFabrikIkTarget(ch.id, 'x', $event)" /></label>
            <label class="lbl">Ziel Y <input class="inp sm" type="number" step="1" :value="ch.targetY" @change="setFabrikIkTarget(ch.id, 'y', $event)" /></label>
            <button type="button" class="mini" @click="removeFabrikIkChain(ch.id)">Kette entfernen</button>
          </div>
        </template>
        <p v-else class="muted small">Noch keine IK-Ketten im Projekt.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0.55rem 0.65rem 0.65rem;
}
.insp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  flex-shrink: 0;
  margin-bottom: 0.45rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #2d3340;
}
.insp-tab {
  padding: 0.32rem 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border: 1px solid #3b3f48;
  border-radius: 6px;
  background: #1a1c22;
  color: #94a3b8;
  cursor: pointer;
}
.insp-tab:hover {
  color: #cbd5e1;
  border-color: #525a6b;
}
.insp-tab--on {
  border-color: #6366f1;
  color: #e0e7ff;
  background: linear-gradient(180deg, #312e52 0%, #252043 100%);
}
.insp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.15rem;
}
.insp-section {
  padding-bottom: 0.35rem;
}
.insp-section .panel-title:first-child {
  margin-top: 0;
}
.sub-title {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #9ca3af;
}
.panel-title {
  margin: 0.85rem 0 0.4rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid #2d3340;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #94a3b8;
}
.panel-title:first-of-type {
  margin-top: 0;
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
.bone-hint {
  margin: 0 0 0.5rem;
  font-size: 0.68rem;
  line-height: 1.45;
  color: #7c8494;
}
.bone-hint .tmono {
  font-variant-numeric: tabular-nums;
  color: #a5b4fc;
}
.bone-hint-warn {
  border-left: 3px solid #f59e0b;
  padding-left: 0.45rem;
  color: #cbd5e1;
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
