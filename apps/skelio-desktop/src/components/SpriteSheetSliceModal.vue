<script setup lang="ts">
import { REFERENCE_IMAGE_ACCEPT_ATTR, normalizeReferenceImageMime } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const { project, spriteSheetSliceModalOpen } = storeToRefs(store);

const sheetInput = ref<HTMLInputElement | null>(null);
const sheetCanvas = ref<HTMLCanvasElement | null>(null);
const dragStart = ref<{ x: number; y: number } | null>(null);
const dragNow = ref<{ x: number; y: number } | null>(null);
const sheetImageEl = shallowRef<HTMLImageElement | null>(null);

/** Standard: nach neuem Sheet-Import schließen → Fokus auf Referenz/Viewport zum Ausrichten. */
const stayOpenAfterSheetImport = ref(false);

const rig = computed(() => project.value.characterRig);
const sheet = computed(() => rig.value?.spriteSheet ?? null);
const slices = computed(() => rig.value?.slices ?? []);

const CW = 560;
const CH = 400;

function close() {
  store.closeSpriteSheetSliceModal();
}

watch(spriteSheetSliceModalOpen, (open) => {
  if (open) {
    stayOpenAfterSheetImport.value = false;
    nextTick(() => drawSheetCanvas());
  }
});

watch(
  () =>
    [rig.value?.spriteSheet?.dataBase64 ?? "", rig.value?.spriteSheet?.mimeType ?? ""] as const,
  () => {
    sheetImageEl.value = null;
    const sh = rig.value?.spriteSheet;
    if (!sh?.dataBase64 || !sh.mimeType) return;
    const img = new Image();
    img.onload = () => {
      sheetImageEl.value = img;
      nextTick(() => drawSheetCanvas());
    };
    img.onerror = () => {
      sheetImageEl.value = null;
    };
    img.src = `data:${sh.mimeType};base64,${sh.dataBase64}`;
  },
  { immediate: true },
);

watch(
  () => [rig.value?.slices, dragStart.value, dragNow.value],
  () => nextTick(() => drawSheetCanvas()),
  { deep: true },
);

function drawSheetCanvas() {
  const c = sheetCanvas.value;
  const img = sheetImageEl.value;
  const sh = sheet.value;
  if (!c || !img || !sh?.dataBase64) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = Math.min(CW / iw, CH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (CW - dw) / 2;
  const oy = (CH - dh) / 2;
  c.width = CW;
  c.height = CH;
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, CW, CH);
  ctx.drawImage(img, ox, oy, dw, dh);

  for (const s of slices.value) {
    const x = ox + s.x * scale;
    const y = oy + s.y * scale;
    const w = s.width * scale;
    const h = s.height * scale;
    ctx.strokeStyle = "rgba(120, 200, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(40, 80, 120, 0.35)";
    ctx.fillRect(x, y, w, h);
  }

  if (dragStart.value && dragNow.value) {
    const x1 = dragStart.value.x;
    const y1 = dragStart.value.y;
    const x2 = dragNow.value.x;
    const y2 = dragNow.value.y;
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.strokeStyle = "rgba(255, 220, 120, 0.95)";
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
  }
}

function onCanvasDown(e: MouseEvent) {
  if (!sheet.value?.pixelWidth) return;
  dragStart.value = { x: e.offsetX, y: e.offsetY };
  dragNow.value = { x: e.offsetX, y: e.offsetY };
}

function onCanvasMove(e: MouseEvent) {
  if (!dragStart.value) return;
  dragNow.value = { x: e.offsetX, y: e.offsetY };
  drawSheetCanvas();
}

function onCanvasUp(e: MouseEvent) {
  const sh = sheet.value;
  if (!dragStart.value || !sh) {
    dragStart.value = null;
    dragNow.value = null;
    return;
  }
  const start = dragStart.value;
  const end = { x: e.offsetX, y: e.offsetY };
  dragStart.value = null;
  dragNow.value = null;

  if (!sh.pixelWidth || !sh.pixelHeight) return;

  const iw = sh.pixelWidth;
  const ih = sh.pixelHeight;
  const scale = Math.min(CW / iw, CH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (CW - dw) / 2;
  const oy = (CH - dh) / 2;

  const x1 = (Math.min(start.x, end.x) - ox) / scale;
  const y1 = (Math.min(start.y, end.y) - oy) / scale;
  const x2 = (Math.max(start.x, end.x) - ox) / scale;
  const y2 = (Math.max(start.y, end.y) - oy) / scale;
  const w = x2 - x1;
  const h = y2 - y1;
  if (w < 2 || h < 2) {
    drawSheetCanvas();
    return;
  }
  store.dispatch({
    type: "addCharacterRigSlice",
    name: `Part ${slices.value.length + 1}`,
    x: Math.max(0, x1),
    y: Math.max(0, y1),
    width: Math.min(w, iw - Math.max(0, x1)),
    height: Math.min(h, ih - Math.max(0, y1)),
  });
  drawSheetCanvas();
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
        mime = (file.type || "").toLowerCase();
      }
      resolve({ fileName: file.name, mimeType: mime, dataBase64 });
    };
    fr.onerror = () => reject(fr.error ?? new Error("Lesen fehlgeschlagen"));
    fr.readAsDataURL(file);
  });
}

async function onSheetFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  try {
    const payload = await readImageFileAsPayload(f);
    const mime = normalizeReferenceImageMime(payload.mimeType);
    if (!mime) {
      alert("Nur PNG, JPEG oder WebP.");
      return;
    }
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = `data:${mime};base64,${payload.dataBase64}`;
    });
    store.dispatch({
      type: "setCharacterRigSpriteSheet",
      fileName: payload.fileName,
      mimeType: mime,
      dataBase64: payload.dataBase64,
      pixelWidth: img.naturalWidth,
      pixelHeight: img.naturalHeight,
    });
    if (!stayOpenAfterSheetImport.value) {
      close();
    }
  } catch {
    alert("Sprite-Sheet konnte nicht geladen werden.");
  }
}

function triggerSheet() {
  sheetInput.value?.click();
}

function removeSlice(id: string) {
  store.dispatch({ type: "removeCharacterRigSlice", sliceId: id });
}

function renameSlice(id: string, name: string) {
  store.dispatch({ type: "renameCharacterRigSlice", sliceId: id, name });
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="spriteSheetSliceModalOpen" class="overlay" @click.self="close">
      <div class="dialog" role="dialog" aria-labelledby="ss-title">
        <header class="head">
          <h2 id="ss-title">Sprite-Sheet schneiden</h2>
          <div class="head-actions">
            <button type="button" class="ghost" @click="store.undo()">Undo</button>
            <button type="button" class="ghost" @click="store.redo()">Redo</button>
            <button type="button" class="close" title="Schließen (Esc)" @click="close">×</button>
          </div>
        </header>

        <p class="lead">
          Ein temporäres Sheet: nach dem Schneiden schließt sich dieses Fenster standardmäßig beim
          <strong>neuen Sheet-Import</strong>, damit du im Hauptfenster die Teile pixelgenau über das
          <strong>Referenzbild</strong> legen kannst (Toolbar: Referenzbild…).
        </p>

        <div class="toolbar">
          <button type="button" @click="triggerSheet">Sheet-Datei laden…</button>
          <input
            ref="sheetInput"
            type="file"
            class="hidden"
            :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
            @change="onSheetFile"
          />
          <button
            v-if="sheet"
            type="button"
            class="ghost"
            @click="store.dispatch({ type: 'clearCharacterRigSpriteSheet' })"
          >
            Sheet entfernen
          </button>
        </div>

        <label class="chk-row">
          <input v-model="stayOpenAfterSheetImport" type="checkbox" />
          <span>Nach neuem Sheet-Import offen lassen (weiter schneiden)</span>
        </label>

        <p v-if="!sheet" class="muted">PNG/JPEG/WebP — im Bild Rechtecke aufziehen.</p>
        <div v-else class="canvas-wrap">
          <canvas
            ref="sheetCanvas"
            class="sheet-canvas"
            width="560"
            height="400"
            @mousedown="onCanvasDown"
            @mousemove="onCanvasMove"
            @mouseup="onCanvasUp"
            @mouseleave="
              dragStart = null;
              dragNow = null;
              drawSheetCanvas();
            "
          />
        </div>

        <ul v-if="slices.length" class="slice-list">
          <li v-for="s in slices" :key="s.id">
            <input
              class="name-input"
              :value="s.name"
              @change="renameSlice(s.id, ($event.target as HTMLInputElement).value)"
            />
            <span class="dim"
              >{{ Math.round(s.x) }},{{ Math.round(s.y) }} × {{ Math.round(s.width) }}×{{
                Math.round(s.height)
              }}</span
            >
            <button type="button" class="ghost danger" @click="removeSlice(s.id)">Entfernen</button>
          </li>
        </ul>

        <footer class="foot">
          <span class="muted">Fertig schneiden → Hauptfenster nutzen (Referenz + Viewport).</span>
          <button type="button" class="primary" @click="close">Fertig / Schließen</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.dialog {
  width: min(640px, 100%);
  max-height: min(92vh, 880px);
  display: flex;
  flex-direction: column;
  background: #1e1f24;
  border: 1px solid #3d4f6b;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  padding: 0 0 0.5rem;
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
  font-size: 1.05rem;
  font-weight: 600;
  color: #93c5fd;
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
.lead {
  margin: 0.75rem 1rem 0.5rem;
  font-size: 0.84rem;
  line-height: 1.45;
  color: #c4c9d4;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0 1rem;
}
.chk-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.5rem 1rem 0.35rem;
  font-size: 0.82rem;
  color: #9ca3af;
  cursor: pointer;
  user-select: none;
}
.chk-row input {
  margin-top: 0.15rem;
}
.muted {
  margin: 0.35rem 1rem;
  color: #6b7280;
  font-size: 0.85rem;
}
.canvas-wrap {
  margin: 0.5rem 1rem 0;
}
.sheet-canvas {
  display: block;
  cursor: crosshair;
  border-radius: 6px;
  border: 1px solid #3b3f48;
  max-width: 100%;
}
.slice-list {
  list-style: none;
  padding: 0;
  margin: 0.75rem 1rem 0;
  max-height: 180px;
  overflow: auto;
}
.slice-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid #333;
}
.name-input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
}
.dim {
  color: #6b7280;
  font-size: 0.8rem;
}
.hidden {
  display: none;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem 0.25rem;
  margin-top: 0.5rem;
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
button.danger:hover {
  border-color: #884444;
  color: #fecaca;
}
</style>
