<script setup lang="ts">
import { clipDurationSeconds, type AnimationClip } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { useEditorStore } from "../stores/editor.js";

const emit = defineEmits<{ setPlaying: [v: boolean] }>();

const store = useEditorStore();
const { project, currentTime, playing, selectedBone } = storeToRefs(store);

const importClipInput = ref<HTMLInputElement | null>(null);

const activeClip = computed(() => project.value.clips.find((c) => c.id === project.value.activeClipId));

const duration = computed(() => {
  const clip = activeClip.value;
  if (!clip) return 4;
  return Math.max(1, clipDurationSeconds(clip, project.value.bones));
});

const canRemoveClip = computed(() => project.value.clips.length > 1);

const enabledIkChain = computed(() => (project.value.ikTwoBoneChains ?? []).find((c) => c.enabled) ?? null);
const canBakeIk = computed(() => !!enabledIkChain.value);
const canAddIkControl = computed(() => {
  const ch = enabledIkChain.value;
  if (!ch) return false;
  const existing = project.value.rig?.controls?.ikTargets2d?.some((c) => c.chainId === ch.id) ?? false;
  return !existing;
});

function addIkControl() {
  const ch = enabledIkChain.value;
  if (!ch) return;
  store.dispatch({ type: "ensureIkTargetControl", chainId: ch.id });
}

function bakeIkToFk() {
  const ch = enabledIkChain.value;
  if (!ch) return;
  const clip = activeClip.value;
  if (!clip) return;
  const d = Math.max(0.001, duration.value);
  const fps = Math.max(1, project.value.meta.fps || 60);
  const step = 1 / fps;
  const sampleTimes: number[] = [];
  for (let t = 0; t <= d + 1e-9; t += step) sampleTimes.push(Math.min(d, t));
  store.dispatch({ type: "bakeIkToFk", chainId: ch.id, sampleTimes });
}

function addKey(prop: "tx" | "ty" | "rot") {
  const b = selectedBone.value;
  if (!b) return;
  const t = currentTime.value;
  /** Channels store offset from bind pose; zero = rest at current bind. */
  const v = 0;
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

function onClipSelect(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value;
  if (id) store.dispatch({ type: "setActiveClip", clipId: id });
}

function newClip() {
  const name = window.prompt("Name der neuen Animation:", `Clip ${project.value.clips.length + 1}`);
  if (name === null) return;
  store.dispatch({ type: "addAnimationClip", name: name.trim() || `Clip ${project.value.clips.length + 1}` });
}

function duplicateClip() {
  const id = activeClip.value?.id;
  if (!id) return;
  store.dispatch({ type: "duplicateAnimationClip", clipId: id });
}

function removeClip() {
  const id = activeClip.value?.id;
  if (!id || !canRemoveClip.value) return;
  if (!window.confirm(`Animation „${activeClip.value?.name}“ löschen?`)) return;
  store.dispatch({ type: "removeAnimationClip", clipId: id });
}

function renameClip() {
  const c = activeClip.value;
  if (!c) return;
  const name = window.prompt("Neuer Name:", c.name);
  if (name === null) return;
  const t = name.trim();
  if (!t) return;
  store.dispatch({ type: "renameAnimationClip", clipId: c.id, name: t });
}

function keyTimesForBone(boneId: string): number[] {
  const clip = activeClip.value;
  if (!clip) return [];
  const tr = clip.tracks.find((t) => t.boneId === boneId);
  if (!tr) return [];
  const times = new Set<number>();
  for (const ch of tr.channels) {
    for (const k of ch.keys) times.add(k.t);
  }
  return [...times].sort((a, b) => a - b);
}

function keyPct(t: number): string {
  const d = duration.value;
  if (d <= 1e-9) return "0%";
  return `${Math.min(100, Math.max(0, (t / d) * 100))}%`;
}

function scrubRail(ev: MouseEvent) {
  const el = ev.currentTarget as HTMLElement;
  const r = el.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const d = duration.value;
  const t = Math.max(0, Math.min(d, (x / Math.max(1e-9, r.width)) * d));
  currentTime.value = t;
}

function jumpToKey(t: number) {
  currentTime.value = t;
}

function exportActiveClipJson() {
  const c = activeClip.value;
  if (!c) return;
  const payload = {
    skelioAnimationClipFormat: "1.0",
    name: c.name,
    tracks: c.tracks,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const safe = c.name.replace(/[^\w\-]+/g, "-").replace(/^-|-$/g, "") || "clip";
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}-animation.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function triggerImportClip() {
  importClipInput.value?.click();
}

function purgeTxTyRotKeysAtCurrentTime() {
  const t = currentTime.value;
  if (
    !window.confirm(
      `Alle TX-, TY- und Rot-Keys bei t=${t.toFixed(2)}s in der aktiven Animation löschen?\n\n` +
        "Danach gilt wieder die Bind-Pose (sinnvoll, wenn die Figur durch Keys mit 0 o. Ä. „kaputt“ wirkt).",
    )
  ) {
    return;
  }
  const ok = store.dispatch({ type: "purgeClipTranslationRotationKeysAtTime", t });
  if (!ok) alert("Konnte nicht ausführen (Validierung).");
}

function onImportClipFile(ev: Event) {
  const inp = ev.target as HTMLInputElement;
  const f = inp.files?.[0];
  inp.value = "";
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const j = JSON.parse(reader.result as string) as {
        skelioAnimationClipFormat?: string;
        name?: string;
        tracks?: AnimationClip["tracks"];
        clip?: { name?: string; tracks?: AnimationClip["tracks"] };
      };
      const raw = j.clip ?? j;
      if (!raw.tracks || !Array.isArray(raw.tracks)) throw new Error("missing tracks");
      const name = typeof raw.name === "string" ? raw.name : typeof j.name === "string" ? j.name : "Imported";
      const clip: AnimationClip = { id: "_", name, tracks: structuredClone(raw.tracks) };
      const ok = store.dispatch({ type: "importAnimationClip", clip });
      if (!ok) alert("Import abgelehnt: unbekannte Knochen-IDs in den Tracks.");
    } catch (e) {
      console.warn(e);
      alert("Import fehlgeschlagen: keine gültige Skelio-Animations-JSON.");
    }
  };
  reader.readAsText(f);
}
</script>

<template>
  <footer class="tl">
    <div class="tl-head">
      <div class="tl-clip">
        <span class="tl-label">Animation</span>
        <select class="tl-clip-select" :value="project.activeClipId" @change="onClipSelect">
          <option v-for="c in project.clips" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div class="tl-clip-actions">
        <button type="button" class="tl-mini" title="Neue Animation" @click="newClip">+ Neu</button>
        <button type="button" class="tl-mini" title="Duplizieren" @click="duplicateClip">Dupl.</button>
        <button type="button" class="tl-mini" title="Umbenennen" @click="renameClip">Name…</button>
        <button type="button" class="tl-mini tl-mini-danger" :disabled="!canRemoveClip" title="Löschen" @click="removeClip">
          Löschen
        </button>
      </div>
      <button type="button" class="tl-play" @click="emit('setPlaying', !playing)">
        {{ playing ? "Pause" : "Play" }}
      </button>
    </div>
    <div class="tl-io">
      <button
        type="button"
        class="tl-io-btn"
        title="Entfernt TX/TY/Rot-Keys genau an der aktuellen Timeline-Zeit (z. B. t=0) — Pose fällt auf Bind-Pose zurück"
        @click="purgeTxTyRotKeysAtCurrentTime"
      >
        Keys @Zeit
      </button>
      <button
        type="button"
        class="tl-io-btn"
        :disabled="!canBakeIk"
        title="Backt den (aktivierten) 2‑Bone IK in FK-Rotations-Keys (rot) über die Clip-Dauer"
        @click="bakeIkToFk"
      >
        Bake IK→FK
      </button>
      <button
        type="button"
        class="tl-io-btn"
        :disabled="!canAddIkControl"
        title="Erzeugt ein IK-Target-Control (Handle im Viewport) für die aktivierte IK-Chain"
        @click="addIkControl"
      >
        + IK Control
      </button>
      <button type="button" class="tl-io-btn" @click="exportActiveClipJson">Export JSON</button>
      <button type="button" class="tl-io-btn" @click="triggerImportClip">Import JSON</button>
      <input
        ref="importClipInput"
        type="file"
        class="hidden"
        accept=".json,application/json"
        @change="onImportClipFile"
      />
    </div>
    <div class="row1">
      <label class="time">
        <span class="time-cap">Zeit (s)</span>
        <input v-model.number="currentTime" type="range" min="0" :max="duration" step="0.01" class="tl-range" />
      </label>
      <span class="val">{{ currentTime.toFixed(2) }} / {{ duration.toFixed(2) }}</span>
    </div>
    <div class="tl-tracks" aria-label="Keyframes pro Knochen">
      <div v-for="b in project.bones" :key="b.id" class="tl-track-row">
        <span class="tl-bone-tag" :class="{ sel: selectedBone?.id === b.id }">{{ b.name }}</span>
        <div class="tl-rail" @click="scrubRail">
          <span class="tl-playhead" :style="{ left: keyPct(currentTime) }" />
          <button
            v-for="kt in keyTimesForBone(b.id)"
            :key="`${b.id}-${kt}`"
            type="button"
            class="tl-dot"
            :style="{ left: keyPct(kt) }"
            :title="`t=${kt.toFixed(3)}`"
            @click.stop="jumpToKey(kt)"
          />
        </div>
      </div>
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
    <p v-else class="muted">Knochen wählen — Keys setzen oder im Viewport ziehen.</p>
  </footer>
</template>

<style scoped>
.hidden {
  display: none;
}
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
  margin-bottom: 0.35rem;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.tl-clip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  flex: 1;
}
.tl-label {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  flex-shrink: 0;
}
.tl-clip-select {
  flex: 1;
  min-width: 6rem;
  max-width: 14rem;
  padding: 0.28rem 0.45rem;
  border-radius: 6px;
  border: 1px solid #3b4252;
  background: #1e2230;
  color: #e2e8f0;
  font-size: 0.78rem;
}
.tl-clip-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.tl-mini {
  padding: 0.22rem 0.4rem;
  border-radius: 5px;
  border: 1px solid #3b4252;
  background: #252830;
  color: #cbd5e1;
  font-size: 0.65rem;
  cursor: pointer;
}
.tl-mini:hover {
  border-color: #6366f1;
  color: #e2e8f0;
}
.tl-mini-danger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tl-mini-danger:not(:disabled):hover {
  border-color: #b91c1c;
  color: #fecaca;
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
.tl-io {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}
.tl-io-btn {
  padding: 0.22rem 0.5rem;
  border-radius: 5px;
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 0.68rem;
  cursor: pointer;
}
.tl-io-btn:hover {
  border-color: #94a3b8;
}
.tl-tracks {
  margin-bottom: 0.45rem;
  max-height: 7.5rem;
  overflow-y: auto;
  border: 1px solid #2a3040;
  border-radius: 6px;
  background: #16181f;
}
.tl-track-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.35rem;
  border-bottom: 1px solid #252830;
}
.tl-track-row:last-child {
  border-bottom: none;
}
.tl-bone-tag {
  width: 4.5rem;
  flex-shrink: 0;
  font-size: 0.65rem;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-bone-tag.sel {
  color: #c7d2fe;
  font-weight: 600;
}
.tl-rail {
  position: relative;
  flex: 1;
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(180deg, #252830 0%, #1a1c24 100%);
  cursor: pointer;
}
.tl-playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #f87171;
  pointer-events: none;
  z-index: 2;
}
.tl-dot {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  margin: -3.5px 0 0 -3.5px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: #a5b4fc;
  cursor: pointer;
  z-index: 1;
}
.tl-dot:hover {
  background: #e0e7ff;
  transform: scale(1.15);
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
