<script setup lang="ts">
import {
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import ViewportPanel from "./ViewportPanel.vue";

const store = useEditorStore();
const { project, characterRigModalOpen, selectedCharacterRigSliceId, sheetSliceModalOpen } =
  storeToRefs(store);

const step = ref(0);
const sheetInput = ref<HTMLInputElement | null>(null);
/** Teil-Detail (Smack-ähnliches „Sprite“-Modal). */
const spriteModalSliceId = ref<string | null>(null);
const partEditName = ref("");
const partEditViewName = ref("Default");
const partEditSide = ref<"front" | "back">("front");

const partModalSlice = computed(() => {
  const id = spriteModalSliceId.value;
  if (!id) return null;
  return slices.value.find((s) => s.id === id) ?? null;
});

watch(spriteModalSliceId, (id) => {
  if (!id) return;
  const s = project.value.characterRig?.slices?.find((x) => x.id === id);
  if (!s) return;
  partEditName.value = s.name;
  partEditViewName.value = s.viewName ?? "Default";
  partEditSide.value = s.side === "back" ? "back" : "front";
});

const steps = [
  {
    id: "sprites",
    title: "Sprites",
    hint: "Links: + Neu = neuer Teil (Slot). Rechts: Sprite-Sheet hinzufügen, Sheet anklicken, Bereich wählen → in gewählten Slot. Mitte: anordnen.",
  },
  { id: "bones", title: "Knochen", hint: "Knochen links in der Hierarchy anlegen; Inspector rechts außerhalb dieses Fensters." },
  { id: "bind", title: "Binden", hint: "Jedes Teil (Sprite-Zeile) einem Knochen zuordnen." },
  { id: "depth", title: "3D / Tiefe", hint: "Optional: Tiefenwerte pro Teil (2.5D)." },
  { id: "preview", title: "Vorschau", hint: "Überblick über Zuordnungen." },
] as const;

const rig = computed(() => project.value.characterRig);
const slices = computed(() => rig.value?.slices ?? []);
const spriteSheets = computed(() => rig.value?.spriteSheets ?? []);
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
  if (sheetSliceModalOpen.value) {
    store.closeSheetSliceModal();
    return;
  }
  if (spriteModalSliceId.value) {
    closePartModal();
    return;
  }
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

function thumbDataUrl(s: CharacterRigSpriteSlice): string {
  const em = s.embedded;
  if (!em?.dataBase64 || !em.mimeType) return "";
  return `data:${em.mimeType};base64,${em.dataBase64}`;
}

function openPartModal(sliceId: string) {
  spriteModalSliceId.value = sliceId;
  store.selectCharacterRigSlice(sliceId);
}

function closePartModal() {
  spriteModalSliceId.value = null;
}

function applyPartModal() {
  const id = spriteModalSliceId.value;
  if (!id) return;
  const ok = store.dispatch({
    type: "patchCharacterRigSlice",
    sliceId: id,
    name: partEditName.value,
    viewName: partEditViewName.value,
    side: partEditSide.value,
  });
  if (!ok) alert("Speichern fehlgeschlagen (Projekt-Validierung). Details in der Konsole.");
  else closePartModal();
}

function setSliceSide(sliceId: string, side: "front" | "back") {
  store.dispatch({ type: "patchCharacterRigSlice", sliceId, side });
}

function setRigMetaName(e: Event) {
  store.dispatch({ type: "setMetaName", name: (e.target as HTMLInputElement).value });
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

function addEmptySlot() {
  store.dispatch({ type: "addCharacterRigEmptyPart" });
}

function triggerSheetImport() {
  sheetInput.value?.click();
}

function sheetThumbDataUrl(sh: CharacterRigSpriteSheetEntry): string {
  return `data:${sh.mimeType};base64,${sh.dataBase64}`;
}

function openSheetSlicePicker(sheetId: string) {
  store.openSheetSliceModal(sheetId);
}

function removeSheet(sheetId: string) {
  store.dispatch({ type: "removeCharacterRigSpriteSheet", sheetId });
}

async function onSheetFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  let okCount = 0;
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
      const ok = store.dispatch({
        type: "addCharacterRigSpriteSheet",
        fileName: f.name,
        mimeType: mime,
        dataBase64: payload.dataBase64,
        pixelWidth: img.naturalWidth,
        pixelHeight: img.naturalHeight,
      });
      if (ok) okCount++;
    } catch {
      /* skip */
    }
  }
  if (files.length > 0 && okCount === 0) {
    alert("Sprite-Sheet konnte nicht hinzugefügt werden (PNG / JPEG / WebP).");
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
          <section class="sprite-rail" aria-label="Sprites und Ansicht">
            <div class="rail-title">Sprites</div>
            <div class="rail-table-wrap">
              <table v-if="slices.length" class="rail-table">
                <thead>
                  <tr>
                    <th>Sprite</th>
                    <th>View</th>
                    <th>Seite</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="s in slices"
                    :key="s.id"
                    class="rail-row"
                    :class="{ active: selectedCharacterRigSliceId === s.id }"
                    @click="store.selectCharacterRigSlice(s.id)"
                    @dblclick="openPartModal(s.id)"
                  >
                    <td class="rail-name">
                      {{ s.name }}
                      <span v-if="s.width <= 0 || s.height <= 0" class="dim"> (leer)</span>
                    </td>
                    <td @click.stop>
                      <input
                        class="rail-input"
                        type="text"
                        :value="s.viewName ?? 'Default'"
                        title="Ansicht (z. B. Default)"
                        @change="
                          store.dispatch({
                            type: 'patchCharacterRigSlice',
                            sliceId: s.id,
                            viewName: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </td>
                    <td @click.stop>
                      <select
                        class="rail-select"
                        :value="s.side ?? 'front'"
                        @change="
                          setSliceSide(s.id, ($event.target as HTMLSelectElement).value as 'front' | 'back')
                        "
                      >
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="muted rail-empty">Noch keine Sprites — „+ Neu“ für einen neuen Teil (Slot).</p>
            </div>
            <button type="button" class="rail-new" @click="addEmptySlot">+ Neu</button>
          </section>

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
              <div class="viewport-foot">
                <label class="rig-name-label"
                  >Name:
                  <input
                    class="rig-name-input"
                    type="text"
                    :value="project.meta.name"
                    @change="setRigMetaName"
                  />
                </label>
              </div>
            </div>
            <div class="step-scroll">
              <p class="hint">{{ steps[step]?.hint }}</p>

              <div v-show="step === 0" class="panel">
                <p class="muted">
                  Links neue <strong>Teile</strong> anlegen, rechts <strong>Sprite-Sheets</strong> laden, Sheet
                  anklicken, im Modal Bereich wählen (Klick oder Rahmen). Gewählten Teil zuvor in der linken Liste
                  anklicken. Teile im Viewport ziehen.
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
                <p v-if="!slices.length" class="muted">Zuerst links Sprites (+ Neu) anlegen und ggf. Pixel aus Sheets zuweisen.</p>
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
                <p v-if="!slices.length" class="muted">Keine Teile — links Slots anlegen.</p>
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

          <aside class="tools" aria-label="Sprite sheets">
            <h3 class="tools-title">Sprite sheets</h3>
            <p class="tools-hint muted">Nur Roh-Texturen. Klick öffnet Auswahl für den <strong>links gewählten</strong> Teil.</p>
            <button type="button" class="primary tools-import" @click="triggerSheetImport">Sprite-Sheet hinzufügen…</button>
            <input
              ref="sheetInput"
              type="file"
              class="hidden"
              multiple
              :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
              @change="onSheetFiles"
            />
            <ul v-if="spriteSheets.length" class="tools-list">
              <li
                v-for="sh in spriteSheets"
                :key="sh.id"
                class="tools-item tools-sheet"
                @click="openSheetSlicePicker(sh.id)"
              >
                <img class="tools-thumb" :src="sheetThumbDataUrl(sh)" alt="" />
                <span class="tools-name" :title="sh.fileName">{{ sh.fileName }}</span>
                <button type="button" class="tools-remove" title="Sheet entfernen" @click.stop="removeSheet(sh.id)">
                  ×
                </button>
              </li>
            </ul>
            <p v-else class="muted tools-empty">Noch keine Sheets — PNG / JPEG / WebP hinzufügen.</p>
          </aside>
        </div>

        <footer class="foot">
          <span class="muted">Änderungen sofort im Projekt (Undo/Redo).</span>
          <button type="button" class="primary" @click="close">Fertig</button>
        </footer>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="characterRigModalOpen && spriteModalSliceId && partModalSlice"
      class="part-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="part-modal-title"
      @click.self="closePartModal"
    >
      <div class="part-dialog" @click.stop>
        <header class="part-head">
          <h3 id="part-modal-title">Sprite</h3>
          <button type="button" class="part-close" title="Schließen" @click="closePartModal">×</button>
        </header>
        <div class="part-body">
          <div class="part-preview-wrap">
            <img
              v-if="thumbDataUrl(partModalSlice)"
              class="part-preview-img"
              :src="thumbDataUrl(partModalSlice)"
              alt=""
            />
            <div v-else class="part-preview-ph">Kein eingebettetes Bild</div>
          </div>
          <label class="part-field"
            >Name
            <input v-model="partEditName" class="part-input" type="text" />
          </label>
          <label class="part-field"
            >View
            <input v-model="partEditViewName" class="part-input" type="text" placeholder="Default" />
          </label>
          <label class="part-field"
            >Seite
            <select v-model="partEditSide" class="part-input">
              <option value="front">Front</option>
              <option value="back">Back</option>
            </select>
          </label>
        </div>
        <footer class="part-foot">
          <button type="button" class="ghost" @click="closePartModal">Schließen</button>
          <button type="button" class="primary" @click="applyPartModal">Übernehmen</button>
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
  /* Mitte mindestens ~40% / 320px — verhindert „dünne“ Viewport-Spalte; rechts fest schmal */
  grid-template-columns:
    minmax(180px, 240px) minmax(112px, 152px) minmax(320px, 1fr) minmax(168px, 200px);
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.sprite-rail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.5rem;
  border-right: 1px solid #3b3f48;
  background: #1a1b20;
  min-height: 0;
  overflow: hidden;
}
.rail-title {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}
.rail-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.75rem;
}
.rail-table th,
.rail-table td {
  border: 1px solid #3b3f48;
  padding: 0.25rem 0.3rem;
  text-align: left;
  vertical-align: middle;
}
.rail-table th {
  background: #25262b;
  color: #9ca3af;
  font-weight: 600;
}
.rail-row {
  cursor: pointer;
}
.rail-row:hover {
  background: #2a2d35;
}
.rail-row.active {
  outline: 1px solid #4f6ab8;
  background: #2a3150;
}
.rail-name {
  max-width: 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e5e7eb;
}
.rail-input {
  width: 100%;
  min-width: 0;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
  font-size: 0.72rem;
}
.rail-select {
  width: 100%;
  padding: 0.15rem 0.2rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
  font-size: 0.72rem;
}
.rail-empty {
  font-size: 0.78rem;
  padding: 0.25rem 0;
  line-height: 1.35;
}
.rail-new {
  flex-shrink: 0;
  padding: 0.4rem;
  border-radius: 6px;
  border: 1px solid #3d6b4a;
  background: #1e3a2f;
  color: #86efac;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.rail-new:hover {
  background: #274a3c;
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
  min-width: min(100%, 320px);
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
.viewport-foot {
  flex-shrink: 0;
  padding: 0.35rem 0.75rem;
  border-top: 1px solid #3b3f48;
  background: #1e1f24;
}
.rig-name-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #9ca3af;
}
.rig-name-input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: #e5e7eb;
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
  min-width: 0;
  max-width: 220px;
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
.tools-hint {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
}
.tools-import {
  width: auto;
  max-width: 100%;
  align-self: flex-start;
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
  justify-content: flex-start;
  gap: 0.4rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #2e3138;
  cursor: pointer;
  border-radius: 4px;
}
.tools-item:hover {
  background: #2a2d35;
}
.tools-item.active {
  background: #2a3150;
  outline: 1px solid #4f6ab8;
}
.tools-thumb {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 4px;
  background: #111;
  flex-shrink: 0;
  border: 1px solid #444;
}
.tools-thumb-ph {
  background: repeating-linear-gradient(45deg, #2a2a2e, #2a2a2e 4px, #333 4px, #333 8px);
}
.tools-name {
  flex: 1;
  min-width: 0;
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

.part-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.part-dialog {
  width: min(480px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: #2a2b31;
  border: 1px solid #555;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}
.part-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #444;
}
.part-head h3 {
  margin: 0;
  font-size: 1rem;
}
.part-close {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.part-body {
  padding: 0.75rem 1rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.part-preview-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 160px;
  background: #fff;
  border-radius: 6px;
  padding: 0.5rem;
}
.part-preview-img {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
  image-rendering: pixelated;
}
.part-preview-ph {
  color: #666;
  font-size: 0.85rem;
}
.part-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: #9ca3af;
}
.part-input {
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: #e5e7eb;
}
.part-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #444;
}
</style>
