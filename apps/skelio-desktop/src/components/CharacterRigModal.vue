<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const { project, characterRigModalOpen, spriteSheetSliceModalOpen } = storeToRefs(store);

const step = ref(0);

const steps = [
  {
    id: "sprites",
    title: "Sprites / Referenz",
    hint: "Referenz + Sheet schneiden im eigenen Fenster — hier kein dauerhaftes Sheet.",
  },
  { id: "bones", title: "Knochen", hint: "Knochen im Hauptfenster anlegen (Hierarchy / Inspector)." },
  { id: "bind", title: "Binden", hint: "Jeden Slice einem Knochen zuordnen." },
  { id: "depth", title: "3D / Tiefe", hint: "Optional: Tiefenwerte pro Teil (2.5D-Spike)." },
  { id: "preview", title: "Vorschau", hint: "Überblick; Rendering im Viewport folgt." },
] as const;

const rig = computed(() => project.value.characterRig);
const slices = computed(() => rig.value?.slices ?? []);
const bindings = computed(() => rig.value?.bindings ?? []);

const bonesSorted = computed(() =>
  [...project.value.bones].sort((a, b) => a.name.localeCompare(b.name)),
);

function bindingBoneId(sliceId: string): string {
  return bindings.value.find((b) => b.sliceId === sliceId)?.boneId ?? "";
}

function depthFor(sliceId: string) {
  const d = rig.value?.sliceDepths?.find((x) => x.sliceId === sliceId);
  return {
    maxDepthFront: d?.maxDepthFront ?? 0,
    maxDepthBack: d?.maxDepthBack ?? 0,
    syncBackWithFront: d?.syncBackWithFront ?? true,
  };
}

function close() {
  store.closeCharacterRigModal();
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (spriteSheetSliceModalOpen.value) return;
  close();
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

function setBinding(sliceId: string, boneId: string) {
  if (!boneId) store.dispatch({ type: "clearCharacterRigBinding", sliceId });
  else store.dispatch({ type: "setCharacterRigBinding", sliceId, boneId });
}

function setDepth(sliceId: string, front: number, back: number, sync: boolean) {
  store.dispatch({
    type: "setCharacterRigSliceDepth",
    sliceId,
    maxDepthFront: front,
    maxDepthBack: back,
    syncBackWithFront: sync,
  });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="characterRigModalOpen" class="overlay" @click.self="close">
      <div class="dialog" role="dialog" aria-labelledby="crig-title">
        <header class="head">
          <h2 id="crig-title">Character Rig</h2>
          <div class="head-actions">
            <button type="button" class="ghost" @click="store.undo()">Undo</button>
            <button type="button" class="ghost" @click="store.redo()">Redo</button>
            <button type="button" class="close" title="Schließen (Esc)" @click="close">×</button>
          </div>
        </header>

        <div class="body">
          <nav class="nav" aria-label="Ablauf">
            <button
              v-for="(s, i) in steps"
              :key="s.id"
              type="button"
              class="nav-btn"
              :class="{ active: step === i }"
              @click="step = i"
            >
              {{ i + 1 }}. {{ s.title }}
            </button>
          </nav>

          <div class="content">
            <p class="hint">{{ steps[step]?.hint }}</p>

            <div v-show="step === 0" class="panel">
              <ol class="workflow">
                <li>
                  <strong>Referenzbild</strong> (Toolbar „Referenzbild…“): ganze Figur als Unterlage — damit lassen sich
                  Teile später pixelgenau im Viewport ausrichten.
                </li>
                <li>
                  <strong>Sprite-Sheet schneiden</strong> passiert im <strong>eigenen Fenster</strong> (nicht hier), wie
                  bei Smack: Sheet temporär, Fokus danach auf Anordnung über die Referenz.
                </li>
              </ol>
              <div class="row">
                <button type="button" class="primary" @click="store.openSpriteSheetSliceModal()">
                  Sprite-Sheet schneiden…
                </button>
              </div>
              <p v-if="slices.length" class="slice-status">
                {{ slices.length }} Slice(s) im Projekt —
                <button type="button" class="linkish" @click="store.openSpriteSheetSliceModal()">
                  Sheet/Slices bearbeiten
                </button>
              </p>
              <p v-else class="muted">Noch keine Slices — Sheet-Fenster öffnen und Rechtecke ziehen.</p>
            </div>

            <div v-show="step === 1" class="panel">
              <p>
                Lege und benenne Knochen im <strong>Hauptfenster</strong> (links Hierarchy, rechts Inspector). Der
                Viewport bleibt die Arbeitsfläche.
              </p>
              <ul class="bone-list">
                <li v-for="b in bonesSorted" :key="b.id">{{ b.name }} <span class="dim">({{ b.id.slice(0, 8) }}…)</span></li>
              </ul>
            </div>

            <div v-show="step === 2" class="panel">
              <p v-if="!slices.length" class="muted">Zuerst im Sprite-Sheet-Modal Slices anlegen.</p>
              <table v-else class="bind-table">
                <thead>
                  <tr>
                    <th>Slice</th>
                    <th>Knochen</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in slices" :key="s.id">
                    <td>{{ s.name }}</td>
                    <td>
                      <select
                        :value="bindingBoneId(s.id)"
                        @change="setBinding(s.id, ($event.target as HTMLSelectElement).value)"
                      >
                        <option value="">—</option>
                        <option v-for="b in bonesSorted" :key="b.id" :value="b.id">{{ b.name }}</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-show="step === 3" class="panel">
              <p v-if="!slices.length" class="muted">Keine Slices — Sprite-Sheet-Modal.</p>
              <div v-for="s in slices" :key="s.id" class="depth-row">
                <label class="depth-label">{{ s.name }}</label>
                <label class="mini"
                  >Vorne max
                  <input
                    type="number"
                    step="0.1"
                    :value="depthFor(s.id).maxDepthFront"
                    @change="
                      setDepth(
                        s.id,
                        Number(($event.target as HTMLInputElement).value),
                        depthFor(s.id).maxDepthBack,
                        depthFor(s.id).syncBackWithFront,
                      )
                    "
                /></label>
                <label class="mini"
                  >Hinten max
                  <input
                    type="number"
                    step="0.1"
                    :disabled="depthFor(s.id).syncBackWithFront"
                    :value="depthFor(s.id).maxDepthBack"
                    @change="
                      setDepth(
                        s.id,
                        depthFor(s.id).maxDepthFront,
                        Number(($event.target as HTMLInputElement).value),
                        depthFor(s.id).syncBackWithFront,
                      )
                    "
                /></label>
                <label class="mini chk"
                  ><input
                    type="checkbox"
                    :checked="depthFor(s.id).syncBackWithFront"
                    @change="
                      setDepth(
                        s.id,
                        depthFor(s.id).maxDepthFront,
                        depthFor(s.id).maxDepthBack,
                        ($event.target as HTMLInputElement).checked,
                      )
                    "
                  />
                  Hinten = vorne</label
                >
              </div>
            </div>

            <div v-show="step === 4" class="panel">
              <p>
                <strong>{{ bindings.length }}</strong> Zuordnung(en), <strong>{{ slices.length }}</strong> Slice(s).
                Gespeichert unter <code>characterRig</code>. Sichtbare Sprites im Viewport folgen (Attachments).
              </p>
              <ul class="summary">
                <li v-for="s in slices" :key="s.id">
                  {{ s.name }} →
                  {{ project.bones.find((b) => b.id === bindingBoneId(s.id))?.name ?? "—" }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <footer class="foot">
          <span class="muted">Änderungen sofort im Projekt (Undo/Redo).</span>
          <button type="button" class="primary" @click="close">Fertig</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.dialog {
  width: min(920px, 100%);
  max-height: min(92vh, 900px);
  display: flex;
  flex-direction: column;
  background: #25262b;
  border: 1px solid #444;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #3b3f48;
}
.head h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}
.head-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.close {
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  border: 1px solid #884444;
  background: #4a2020;
  color: #fecaca;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.body {
  display: grid;
  grid-template-columns: 200px 1fr;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border-right: 1px solid #3b3f48;
  background: #1e1f24;
  overflow: auto;
}
.nav-btn {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #d1d5db;
  cursor: pointer;
  font-size: 0.82rem;
}
.nav-btn:hover {
  background: #2e3138;
}
.nav-btn.active {
  border-color: #4f6ab8;
  background: #2a3150;
  color: #a5b4fc;
}
.content {
  padding: 0.75rem 1rem;
  overflow: auto;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #9ca3af;
}
.panel {
  font-size: 0.9rem;
}
.workflow {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  line-height: 1.5;
  color: #d1d5db;
}
.workflow li {
  margin-bottom: 0.5rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.slice-status {
  margin: 0.75rem 0 0;
  font-size: 0.88rem;
  color: #9ca3af;
}
.linkish {
  padding: 0;
  border: none;
  background: none;
  color: #93c5fd;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}
.muted {
  color: #6b7280;
  font-size: 0.85rem;
}
.dim {
  color: #6b7280;
  font-size: 0.8rem;
}
.bone-list {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
}
.bind-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.bind-table th,
.bind-table td {
  border: 1px solid #3b3f48;
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.bind-table select {
  width: 100%;
  padding: 0.25rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
}
.depth-row {
  display: grid;
  grid-template-columns: 1fr repeat(3, auto);
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}
.depth-label {
  font-weight: 500;
}
.mini {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #9ca3af;
}
.mini input[type="number"] {
  width: 4.5rem;
  padding: 0.2rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
}
.mini.chk {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
}
.summary {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  color: #d1d5db;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid #3b3f48;
}
button {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  color: inherit;
  cursor: pointer;
}
button.primary {
  background: #3730a3;
  border-color: #4c4e9e;
  color: #eef;
}
button.ghost {
  border-color: #555;
  color: #9ca3af;
  background: transparent;
}
code {
  font-size: 0.8em;
  color: #a5b4fc;
}
</style>
