<script setup lang="ts">
/**
 * Sprites step: drawing mode + front/back ops (Smack-like).
 */
import type { CharacterRigSpriteSlice } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import {
  buildEmbeddedBackFromFront,
  clearImageDataTransparent,
  flipImageDataHorizontal,
  imageDataToPngEmbedded,
  rasterizeSliceToImageData,
} from "../slicePixelToolkit.js";

const store = useEditorStore();
const { project, selectedCharacterRigSliceId } = storeToRefs(store);

export type SpriteEditTool = "move" | "brush" | "fill" | "eraser" | "select" | "knife";

const spriteEditTool = ref<SpriteEditTool>("move");
const editLayer = ref<"front" | "back">("front");
const brushRadius = ref(4);
const statusMsg = ref("");

const canvasRef = ref<HTMLCanvasElement | null>(null);
let imageData: ImageData | null = null;
let drawing = false;
let lastX = 0;
let lastY = 0;

const selectedSlice = computed(
  () => project.value.characterRig?.slices?.find((s) => s.id === selectedCharacterRigSliceId.value) ?? null,
);

const canEditPixels = computed(() => {
  const s = selectedSlice.value;
  return !!(s && s.width > 0 && s.height > 0);
});

const toolNeedsCanvas = computed(() =>
  ["brush", "fill", "eraser", "select"].includes(spriteEditTool.value),
);

function setTool(t: SpriteEditTool) {
  spriteEditTool.value = t;
  statusMsg.value = "";
}

async function ensureEmbeddedFromSheet(): Promise<boolean> {
  const id = selectedCharacterRigSliceId.value;
  const s = project.value.characterRig?.slices?.find((x) => x.id === id);
  if (!s || !id) return false;
  if (s.embedded?.dataBase64) return true;
  if (!s.sheetId) return false;
  const r = await rasterizeSliceToImageData(project.value, id);
  if (!r) return false;
  const img = imageDataToPngEmbedded(r.data);
  return store.dispatch({ type: "promoteCharacterRigSliceToEmbedded", sliceId: id, image: img });
}

async function loadLayerIntoBuffer(): Promise<void> {
  imageData = null;
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const s = project.value.characterRig?.slices?.find((x) => x.id === id);
  if (!s || s.width <= 0) return;

  if (editLayer.value === "back") {
    if (s.embeddedBack?.dataBase64 && s.embeddedBack.mimeType) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode"));
        img.src = `data:${s.embeddedBack!.mimeType};base64,${s.embeddedBack!.dataBase64}`;
      });
      const c = document.createElement("canvas");
      c.width = s.width;
      c.height = s.height;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      imageData = ctx.getImageData(0, 0, s.width, s.height);
    } else {
      const front = await rasterizeSliceToImageData(project.value, id);
      if (front) {
        imageData = new ImageData(new Uint8ClampedArray(front.data.data), front.w, front.h);
        clearImageDataTransparent(imageData);
      }
    }
    return;
  }

  const front = await rasterizeSliceToImageData(project.value, id);
  if (front) {
    imageData = new ImageData(new Uint8ClampedArray(front.data.data), front.w, front.h);
  }
}

async function syncCanvasSize() {
  await nextTick();
  const c = canvasRef.value;
  const s = selectedSlice.value;
  if (!c || !s || s.width <= 0) return;
  const scale = Math.min(4, Math.max(1, Math.floor(320 / Math.max(s.width, s.height))));
  c.width = s.width;
  c.height = s.height;
  c.style.width = `${s.width * scale}px`;
  c.style.height = `${s.height * scale}px`;
  const ctx = c.getContext("2d");
  if (!ctx || !imageData) return;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(imageData, 0, 0);
}

watch(
  [selectedCharacterRigSliceId, editLayer, () => project.value.characterRig],
  async () => {
    if (!toolNeedsCanvas.value) return;
    await loadLayerIntoBuffer();
    await syncCanvasSize();
  },
  { deep: true },
);

watch(spriteEditTool, async (t) => {
  if (["brush", "fill", "eraser", "select"].includes(t)) {
    const ok = await ensureEmbeddedFromSheet();
    if (!ok && selectedSlice.value?.sheetId) {
      statusMsg.value = "Could not embed sheet.";
      return;
    }
    await loadLayerIntoBuffer();
    await syncCanvasSize();
  }
});

function commitBuffer() {
  const id = selectedCharacterRigSliceId.value;
  const s = selectedSlice.value;
  if (!id || !s || !imageData) return;
  const img = imageDataToPngEmbedded(imageData);
  if (editLayer.value === "front") {
    store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: id, layer: "front", image: img });
  } else {
    store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: id, layer: "back", image: img });
  }
}

function paintDot(x: number, y: number, erase: boolean) {
  if (!imageData) return;
  const w = imageData.width;
  const h = imageData.height;
  const r = brushRadius.value;
  const d = imageData.data;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = Math.floor(x + dx);
      const py = Math.floor(y + dy);
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const i = (py * w + px) * 4;
      if (erase) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      } else {
        d[i] = 240;
        d[i + 1] = 240;
        d[i + 2] = 255;
        d[i + 3] = 255;
      }
    }
  }
}

function drawLine(x0: number, y0: number, x1: number, y1: number, erase: boolean) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    paintDot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, erase);
  }
}

function redrawCanvas() {
  const c = canvasRef.value;
  if (!c || !imageData) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  ctx.putImageData(imageData, 0, 0);
}

function onPointerDown(e: PointerEvent) {
  if (!toolNeedsCanvas.value || !imageData) return;
  const c = canvasRef.value;
  if (!c) return;
  const rect = c.getBoundingClientRect();
  const sx = c.width;
  const sy = c.height;
  const x = ((e.clientX - rect.left) / rect.width) * sx;
  const y = ((e.clientY - rect.top) / rect.height) * sy;

  if (spriteEditTool.value === "fill") {
    floodFill(Math.floor(x), Math.floor(y));
    redrawCanvas();
    commitBuffer();
    return;
  }

  if (spriteEditTool.value === "brush" || spriteEditTool.value === "eraser") {
    drawing = true;
    const erase = spriteEditTool.value === "eraser";
    paintDot(x, y, erase);
    lastX = x;
    lastY = y;
    redrawCanvas();
    c.setPointerCapture(e.pointerId);
  }

  if (spriteEditTool.value === "select") {
    statusMsg.value = "Marquee select: coming soon — use brush for now.";
  }
}

function onPointerMove(e: PointerEvent) {
  if (!drawing || !imageData) return;
  const c = canvasRef.value;
  if (!c) return;
  const rect = c.getBoundingClientRect();
  const sx = c.width;
  const sy = c.height;
  const x = ((e.clientX - rect.left) / rect.width) * sx;
  const y = ((e.clientY - rect.top) / rect.height) * sy;
  const erase = spriteEditTool.value === "eraser";
  drawLine(lastX, lastY, x, y, erase);
  lastX = x;
  lastY = y;
  redrawCanvas();
}

function onPointerUp(e: PointerEvent) {
  if (!drawing) return;
  drawing = false;
  const c = canvasRef.value;
  if (c?.hasPointerCapture(e.pointerId)) {
    try {
      c.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  commitBuffer();
}

function floodFill(x: number, y: number) {
  if (!imageData) return;
  const w = imageData.width;
  const h = imageData.height;
  const d = imageData.data;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const start = (y * w + x) * 4;
  const tr = d[start]!;
  const tg = d[start + 1]!;
  const tb = d[start + 2]!;
  const ta = d[start + 3]!;
  const nr = 220;
  const ng = 230;
  const nb = 255;
  const na = 255;
  if (tr === nr && tg === ng && tb === nb && ta === na) return;

  const stack: [number, number][] = [[x, y]];
  const seen = new Set<number>();
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    const key = cy * w + cx;
    if (seen.has(key)) continue;
    seen.add(key);
    const i = key * 4;
    if (d[i] !== tr || d[i + 1] !== tg || d[i + 2] !== tb || d[i + 3] !== ta) continue;
    d[i] = nr;
    d[i + 1] = ng;
    d[i + 2] = nb;
    d[i + 3] = na;
    if (cx > 0) stack.push([cx - 1, cy]);
    if (cx < w - 1) stack.push([cx + 1, cy]);
    if (cy > 0) stack.push([cx, cy - 1]);
    if (cy < h - 1) stack.push([cx, cy + 1]);
  }
}

async function opClearLayer() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const s = selectedSlice.value;
  if (!s) return;
  if (editLayer.value === "back") {
    store.dispatch({ type: "clearCharacterRigSliceEmbeddedBack", sliceId: id });
    statusMsg.value = "Back layer removed.";
    await loadLayerIntoBuffer();
    await syncCanvasSize();
    return;
  }
  await ensureEmbeddedFromSheet();
  const r = await rasterizeSliceToImageData(project.value, id);
  if (!r) return;
  const empty = new ImageData(r.w, r.h);
  clearImageDataTransparent(empty);
  const img = imageDataToPngEmbedded(empty);
  store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: id, layer: "front", image: img });
  statusMsg.value = "Front layer cleared.";
  await loadLayerIntoBuffer();
  await syncCanvasSize();
}

async function opCopyFrontToBack() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  await ensureEmbeddedFromSheet();
  const img = await buildEmbeddedBackFromFront(project.value, id);
  if (!img) return;
  store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: id, layer: "back", image: img });
  statusMsg.value = "Copied front → back.";
}

async function opCopyBackToFront() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const s = selectedSlice.value;
  if (!s?.embeddedBack?.dataBase64) {
    statusMsg.value = "No back layer.";
    return;
  }
  const data = await rasterizeSliceToImageDataFromLayer(s, "back");
  if (!data) return;
  const img = imageDataToPngEmbedded(data);
  store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: id, layer: "front", image: img });
  statusMsg.value = "Copied back → front.";
}

async function rasterizeSliceToImageDataFromLayer(
  s: CharacterRigSpriteSlice,
  layer: "front" | "back",
): Promise<ImageData | null> {
  if (layer === "back" && s.embeddedBack?.dataBase64 && s.embeddedBack.mimeType) {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("decode"));
      img.src = `data:${s.embeddedBack!.mimeType};base64,${s.embeddedBack!.dataBase64}`;
    });
    const c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, s.width, s.height);
  }
  const r = await rasterizeSliceToImageData(project.value, s.id);
  return r?.data ?? null;
}

async function opCopyAllFrontsToBacks() {
  const slices = project.value.characterRig?.slices ?? [];
  for (const s of slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const img = await buildEmbeddedBackFromFront(project.value, s.id);
    if (img) {
      store.dispatch({ type: "setCharacterRigSliceLayerPixels", sliceId: s.id, layer: "back", image: img });
    }
  }
  statusMsg.value = "Copied all fronts → backs.";
}

async function opFlipHorizontal() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const s = selectedSlice.value;
  if (!s) return;
  await ensureEmbeddedFromSheet();
  const layer = editLayer.value;
  const data = await rasterizeSliceToImageDataFromLayer(s, layer);
  if (!data) return;
  flipImageDataHorizontal(data);
  const img = imageDataToPngEmbedded(data);
  store.dispatch({
    type: "setCharacterRigSliceLayerPixels",
    sliceId: id,
    layer: layer === "front" ? "front" : "back",
    image: img,
  });
  statusMsg.value = "Flipped horizontally.";
  await loadLayerIntoBuffer();
  await syncCanvasSize();
}

onUnmounted(() => {
  imageData = null;
});
</script>

<template>
  <div class="sse-panel" v-if="canEditPixels">
    <div class="sse-row">
      <span class="sse-label">Drawing mode</span>
      <div class="sse-tools" role="toolbar" aria-label="Drawing mode">
        <button
          type="button"
          class="sse-tb"
          :class="{ on: spriteEditTool === 'move' }"
          title="Move parts in the viewport"
          @click="setTool('move')"
        >
          Move
        </button>
        <button
          type="button"
          class="sse-tb"
          :class="{ on: spriteEditTool === 'select' }"
          title="Select (placeholder)"
          @click="setTool('select')"
        >
          Select
        </button>
        <button
          type="button"
          class="sse-tb"
          :class="{ on: spriteEditTool === 'brush' }"
          title="Brush"
          @click="setTool('brush')"
        >
          Brush
        </button>
        <button
          type="button"
          class="sse-tb"
          :class="{ on: spriteEditTool === 'fill' }"
          title="Fill"
          @click="setTool('fill')"
        >
          Fill
        </button>
        <button
          type="button"
          class="sse-tb"
          :class="{ on: spriteEditTool === 'eraser' }"
          title="Eraser"
          @click="setTool('eraser')"
        >
          Eraser
        </button>
        <button type="button" class="sse-tb sse-tb-dim" disabled title="Demnächst">Knife</button>
      </div>
    </div>

    <div class="sse-row sse-layer">
      <span class="sse-label">Edit layer</span>
      <label class="sse-radio"
        ><input v-model="editLayer" type="radio" value="front" /> Front</label
      >
      <label class="sse-radio"
        ><input v-model="editLayer" type="radio" value="back" /> Back</label
      >
      <label v-if="spriteEditTool === 'brush' || spriteEditTool === 'eraser'" class="sse-brush"
        >Size <input v-model.number="brushRadius" type="number" min="1" max="32" class="sse-num"
      /></label>
    </div>

    <div v-if="spriteEditTool === 'move'" class="sse-hint muted">
      <strong>Move:</strong> drag the selected part in the 3D viewport (same as before).
    </div>

    <div v-else-if="toolNeedsCanvas" class="sse-canvas-wrap">
      <canvas
        ref="canvasRef"
        class="sse-canvas"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointerleave="onPointerUp"
      />
      <p v-if="statusMsg" class="sse-status">{{ statusMsg }}</p>
    </div>

    <div class="sse-row sse-ops">
      <span class="sse-label">Operations</span>
      <div class="sse-op-btns">
        <button type="button" class="sse-op" @click="opClearLayer">Clear layer</button>
        <button type="button" class="sse-op" @click="opCopyFrontToBack">Copy front → back</button>
        <button type="button" class="sse-op" @click="opCopyBackToFront">Copy back → front</button>
        <button type="button" class="sse-op" @click="opCopyAllFrontsToBacks">Copy ALL front → back</button>
        <button type="button" class="sse-op" @click="opFlipHorizontal">Flip horizontal</button>
      </div>
    </div>
  </div>
  <p v-else class="muted sse-empty">Pick a sprite on the left — row must have pixels.</p>
</template>

<style scoped>
.sse-panel {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  margin-top: 0.5rem;
}
.sse-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.65rem;
}
.sse-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  min-width: 5.5rem;
}
.sse-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.sse-tb {
  padding: 0.25rem 0.45rem;
  font-size: 0.72rem;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #2a2b31;
  color: #e5e7eb;
  cursor: pointer;
}
.sse-tb:hover {
  background: #32333b;
}
.sse-tb.on {
  border-color: #3b82f6;
  background: #1e3a5f;
  color: #fff;
}
.sse-tb-dim {
  opacity: 0.45;
  cursor: not-allowed;
}
.sse-layer .sse-radio {
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}
.sse-brush {
  font-size: 0.75rem;
  color: #9ca3af;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.sse-num {
  width: 3rem;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: #e5e7eb;
}
.sse-hint {
  font-size: 0.78rem;
}
.sse-canvas-wrap {
  border: 1px solid #3b3f48;
  border-radius: 6px;
  padding: 0.5rem;
  background: #121316;
  overflow: auto;
  max-height: 240px;
}
.sse-canvas {
  display: block;
  cursor: crosshair;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.sse-status {
  font-size: 0.72rem;
  color: #a5b4fc;
  margin: 0.35rem 0 0;
}
.sse-ops {
  flex-direction: column;
  align-items: flex-start;
}
.sse-op-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.sse-op {
  padding: 0.28rem 0.5rem;
  font-size: 0.72rem;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #25262c;
  color: #e5e7eb;
  cursor: pointer;
}
.sse-op:hover {
  background: #2f3038;
}
.sse-empty {
  font-size: 0.78rem;
  margin-top: 0.35rem;
}
</style>
