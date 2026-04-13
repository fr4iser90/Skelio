<script setup lang="ts">
import {
  meshDisplayNameFromFileName,
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useEditorStore } from "../stores/editor.js";
import ViewportPanel from "./ViewportPanel.vue";

const store = useEditorStore();
const { project, characterRigModalOpen } = storeToRefs(store);

const step = ref(0);
const importInput = ref<HTMLInputElement | null>(null);

const steps = [
  {
    id: "sprites",
    title: "Sprites",
    hint: "Rechts: Teile importieren · Mitte: im Viewport ausrichten. Optional: Toolbar „Referenzbild…“ als Unterlage.",
  },
  { id: "bones", title: "Knochen", hint: "Knochen links in der Hierarchy anlegen; Inspector rechts außerhalb dieses Fensters." },
  { id: "bind", title: "Binden", hint: "Jeden importierten Teil einem Knochen zuordnen." },
  { id: "depth", title: "3D / Tiefe", hint: "Optional: Tiefenwerte pro Teil (2.5D)." },
  { id: "preview", title: "Vorschau", hint: "Überblick über Zuordnungen." },
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
  if (e.key === "Escape") close();
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

function removeSlice(sliceId: string) {
  store.dispatch({ type: "removeCharacterRigSlice", sliceId });
}

function readImageFileAsPayload(file: File): Promise<{ fileName: string; mimeType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result as string;
      const m = s.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        reject(new Error("Bild konnte nicht gelesen werden."));
        return;
      }
      let mime = m[1]!.trim().toLowerCase();
      const dataBase64 = m[2]!.replace(/\s/g, "");
      if (!mime || mime === "application/octet-stream") {
        mime = (file.type || mimeFromFileName(file.name) || "").toLowerCase();
      }
      resolve({ fileName: file.name, mimeType: mime, dataBase64 });
    };
    fr.onerror = () => reject(fr.error ?? new Error("Lesen fehlgeschlagen"));
    fr.readAsDataURL(file);
  });
}

function triggerImport() {
  importInput.value?.click();
}

async function onImportFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  for (const f of files) {
    try {
      const payload = await readImageFileAsPayload(f);
      const mime = normalizeReferenceImageMime(payload.mimeType);
      if (!mime) continue;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode"));
        img.src = `data:${mime};base64,${payload.dataBase64}`;
      });
      const name = meshDisplayNameFromFileName(f.name);
      store.dispatch({
        type: "addCharacterRigImportedSprite",
        name,
        mimeType: mime,
        dataBase64: payload.dataBase64,
        pixelWidth: img.naturalWidth,
        pixelHeight: img.naturalHeight,
      });
    } catch {
      /* ungültige Datei überspringen */
    }
  }
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

          <div class="main-col">
            <div class="viewport-wrap">
              <ViewportPanel />
            </div>
            <div class="step-scroll">
              <p class="hint">{{ steps[step]?.hint }}</p>

              <div v-show="step === 0" class="panel">
                <p class="muted">
                  Ein Bild = ein Teil. Mehrere Dateien auf einmal möglich. Teile im Viewport ziehen (pixelgenau).
                </p>
              </div>

              <div v-show="step === 1" class="panel">
                <p>
                  Lege und benenne Knochen in der <strong>Hierarchy</strong> (linker Streifen im Hauptfenster) und im
                  <strong>Inspector</strong>.
                </p>
                <ul class="bone-list">
                  <li v-for="b in bonesSorted" :key="b.id">
                    {{ b.name }} <span class="dim">({{ b.id.slice(0, 8) }}…)</span>
                  </li>
                </ul>
              </div>

              <div v-show="step === 2" class="panel">
                <p v-if="!slices.length" class="muted">Zuerst rechts Sprites importieren.</p>
                <table v-else class="bind-table">
                  <thead>
                    <tr>
                      <th>Teil</th>
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
                <p v-if="!slices.length" class="muted">Keine Teile — zuerst Sprites importieren.</p>
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
                  <strong>{{ bindings.length }}</strong> Zuordnung(en), <strong>{{ slices.length }}</strong> Teil(e).
                  Gespeichert unter <code>characterRig</code>.
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

          <aside class="tools" aria-label="Sprites">
            <h3 class="tools-title">Sprites</h3>
            <button type="button" class="primary tools-import" @click="triggerImport">Sprites importieren…</button>
            <input
              ref="importInput"
              type="file"
              class="hidden"
              multiple
              :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
              @change="onImportFiles"
            />
            <ul v-if="slices.length" class="tools-list">
              <li v-for="s in slices" :key="s.id" class="tools-item">
                <span class="tools-name" :title="s.name">{{ s.name }}</span>
                <button type="button" class="tools-remove" title="Entfernen" @click="removeSlice(s.id)">×</button>
              </li>
            </ul>
            <p v-else class="muted tools-empty">Noch keine Teile — Bilder wählen (PNG / JPEG / WebP).</p>
          </aside>
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
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0.35rem;
}
.dialog {
  width: 100%;
  max-width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #25262b;
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #3b3f48;
  flex-shrink: 0;
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
  grid-template-columns: minmax(160px, 200px) minmax(0, 1fr) minmax(160px, 220px);
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
.main-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.viewport-wrap {
  flex: 1 1 55%;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  position: relative;
  border-bottom: 1px solid #3b3f48;
  background: #1a1b1e;
}
.viewport-wrap :deep(.viewport) {
  flex: 1;
  min-height: 0;
}
.step-scroll {
  flex: 0 1 45%;
  min-height: 120px;
  overflow: auto;
  padding: 0.75rem 1rem;
}
.tools {
  border-left: 1px solid #3b3f48;
  background: #1e1f24;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  overflow: auto;
}
.tools-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tools-import {
  width: 100%;
}
.tools-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.82rem;
}
.tools-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid #2e3138;
}
.tools-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d1d5db;
}
.tools-remove {
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  line-height: 1;
  border-radius: 4px;
  border: 1px solid #555;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}
.tools-remove:hover {
  background: #3f2020;
  border-color: #884444;
  color: #fecaca;
}
.tools-empty {
  font-size: 0.82rem;
  line-height: 1.4;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #9ca3af;
}
.panel {
  font-size: 0.9rem;
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
  flex-shrink: 0;
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
.hidden {
  display: none;
}
code {
  font-size: 0.8em;
  color: #a5b4fc;
}
</style>
