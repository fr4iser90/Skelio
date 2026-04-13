<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const { project, sheetSliceModalOpen, sheetSliceModalSheetId, selectedCharacterRigSliceId } =
  storeToRefs(store);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const mode = ref<"click" | "drag">("click");
const sheetImage = ref<HTMLImageElement | null>(null);
const dragStart = ref<{ ix: number; iy: number } | null>(null);
const dragMoved = ref(false);
const suppressNextClick = ref(false);
const previewRect = ref<{ x: number; y: number; w: number; h: number } | null>(null);

const sheet = computed(() =>
  project.value.characterRig?.spriteSheets?.find((s) => s.id === sheetSliceModalSheetId.value),
);

watch([sheetSliceModalOpen, sheet], async () => {
  sheetImage.value = null;
  previewRect.value = null;
  dragStart.value = null;
  dragMoved.value = false;
  suppressNextClick.value = false;
  if (!sheetSliceModalOpen.value || !sheet.value) return;
  const sh = sheet.value;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode"));
    img.src = `data:${sh.mimeType};base64,${sh.dataBase64}`;
  });
  sheetImage.value = img;
  await nextTick();
  paintCanvas();
});

function paintCanvas() {
  const c = canvasRef.value;
  const img = sheetImage.value;
  if (!c || !img?.complete || img.naturalWidth <= 0) return;
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  const pr = previewRect.value;
  if (pr && pr.w > 0 && pr.h > 0) {
    ctx.strokeStyle = "rgba(59, 130, 246, 0.95)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    ctx.setLineDash([]);
  }
}

function clientToImage(e: MouseEvent): { ix: number; iy: number } | null {
  const c = canvasRef.value;
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (c.width / r.width);
  const sy = (e.clientY - r.top) * (c.height / r.height);
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  if (ix < 0 || iy < 0 || ix >= c.width || iy >= c.height) return null;
  return { ix, iy };
}

function floodFillBounds(ix: number, iy: number): { x: number; y: number; w: number; h: number } | null {
  const img = sheetImage.value;
  if (!img?.complete) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const alphaAt = (x: number, y: number) => data[(y * w + x) * 4 + 3]!;
  if (alphaAt(ix, iy) < 16) return null;
  const visited = new Uint8Array(w * h);
  const stack: [number, number][] = [[ix, iy]];
  let minX = ix;
  let maxX = ix;
  let minY = iy;
  let maxY = iy;
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const i = y * w + x;
    if (visited[i]) continue;
    visited[i] = 1;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const neigh: [number, number][] = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (visited[ny * w + nx]) continue;
      if (alphaAt(nx, ny) < 16) continue;
      stack.push([nx, ny]);
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function onCanvasMouseDown(e: MouseEvent) {
  if (mode.value !== "drag") return;
  const p = clientToImage(e);
  if (!p) return;
  dragStart.value = p;
  dragMoved.value = false;
  previewRect.value = { x: p.ix, y: p.iy, w: 0, h: 0 };
  paintCanvas();
}

function onCanvasMouseMove(e: MouseEvent) {
  if (mode.value !== "drag" || !dragStart.value) return;
  const p = clientToImage(e);
  if (!p) return;
  dragMoved.value = true;
  const x0 = dragStart.value.ix;
  const y0 = dragStart.value.iy;
  const x1 = p.ix;
  const y1 = p.iy;
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const rw = Math.abs(x1 - x0) + 1;
  const rh = Math.abs(y1 - y0) + 1;
  previewRect.value = { x, y, w: rw, h: rh };
  paintCanvas();
}

function onCanvasMouseUp() {
  if (mode.value !== "drag") return;
  if (dragMoved.value) suppressNextClick.value = true;
  dragStart.value = null;
  dragMoved.value = false;
}

function onCanvasClick(e: MouseEvent) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (mode.value !== "click") return;
  const p = clientToImage(e);
  if (!p) return;
  const b = floodFillBounds(p.ix, p.iy);
  previewRect.value = b;
  paintCanvas();
}

function accept() {
  const sid = selectedCharacterRigSliceId.value;
  const shId = sheetSliceModalSheetId.value;
  const r = previewRect.value;
  if (!sid) {
    alert("Links einen Sprite (Zeile) auswählen.");
    return;
  }
  if (!shId || !r || r.w <= 0 || r.h <= 0) {
    alert("Zuerst einen Bereich wählen (Klick = zusammenhängend, oder Rahmen ziehen).");
    return;
  }
  const ok = store.dispatch({
    type: "assignCharacterRigSliceFromSheetRegion",
    sliceId: sid,
    sheetId: shId,
    x: r.x,
    y: r.y,
    width: r.w,
    height: r.h,
  });
  if (!ok) alert("Übernehmen fehlgeschlagen (Validierung).");
  else store.closeSheetSliceModal();
}

function close() {
  store.closeSheetSliceModal();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="sheetSliceModalOpen && sheet"
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ssm-title"
      @click.self="close"
    >
      <div class="dialog" @click.stop>
        <header class="head">
          <h2 id="ssm-title">Bereich aus Sprite-Sheet</h2>
          <button type="button" class="close-x" title="Schließen" @click="close">×</button>
        </header>
        <p class="sub">
          Gewählter Sprite links: <strong>{{ selectedCharacterRigSliceId ? "ja" : "nein — Zeile anklicken" }}</strong>
        </p>
        <div class="modes">
          <label
            ><input v-model="mode" type="radio" value="click" /> Klick (zusammenhängende Fläche / „Magic“)</label
          >
          <label><input v-model="mode" type="radio" value="drag" /> Rahmen ziehen</label>
        </div>
        <div class="canvas-wrap">
          <canvas
            ref="canvasRef"
            class="sheet-canvas"
            @click="onCanvasClick($event)"
            @mousedown="mode === 'drag' ? onCanvasMouseDown($event) : undefined"
            @mousemove="onCanvasMouseMove"
            @mouseup="onCanvasMouseUp"
            @mouseleave="onCanvasMouseUp"
          />
        </div>
        <footer class="foot">
          <button type="button" class="ghost" @click="close">Abbrechen</button>
          <button type="button" class="primary" @click="accept">Übernehmen</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.dialog {
  max-width: min(96vw, 900px);
  max-height: min(92vh, 800px);
  display: flex;
  flex-direction: column;
  background: #2a2b31;
  border: 1px solid #555;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #444;
}
.head h2 {
  margin: 0;
  font-size: 1rem;
}
.close-x {
  border: none;
  background: transparent;
  color: #f87171;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}
.sub {
  margin: 0;
  padding: 0.4rem 0.75rem;
  font-size: 0.82rem;
  color: #9ca3af;
}
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  color: #d1d5db;
}
.canvas-wrap {
  overflow: auto;
  max-height: min(60vh, 520px);
  padding: 0.5rem 0.75rem;
  background: #111;
}
.sheet-canvas {
  display: block;
  image-rendering: pixelated;
  cursor: crosshair;
  max-width: 100%;
  height: auto;
}
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #444;
}
button {
  padding: 0.35rem 0.75rem;
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
</style>
