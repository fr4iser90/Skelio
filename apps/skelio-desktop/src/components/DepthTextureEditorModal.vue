<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";

type Side = "front" | "back";

const props = defineProps<{
  open: boolean;
  sliceId: string | null;
  side: Side;
}>();
const emit = defineEmits<{
  (e: "close"): void;
}>();

const store = useEditorStore();
const { project } = storeToRefs(store);

const brushRadius = ref(18);
const brushStrength = ref(0.28);
const brushSubtract = ref(false);

const canvas = ref<HTMLCanvasElement | null>(null);
const drawing = ref<{ pointerId: number } | null>(null);
const lastPos = ref<{ x: number; y: number } | null>(null);

const slice = computed(() => {
  const id = props.sliceId;
  if (!id) return null;
  return project.value.characterRig?.slices?.find((s) => s.id === id) ?? null;
});

const depthEntry = computed(() => {
  const id = props.sliceId;
  if (!id) return null;
  return project.value.characterRig?.sliceDepths?.find((d) => d.sliceId === id) ?? null;
});

const currentTex = computed(() => {
  const d = depthEntry.value as any;
  if (!d) return null;
  return props.side === "front" ? d.depthTextureFront ?? null : d.depthTextureBack ?? null;
});

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function ensureCanvasSize() {
  const el = canvas.value;
  const s = slice.value;
  if (!el || !s) return;
  const w = Math.max(1, Math.floor(s.width));
  const h = Math.max(1, Math.floor(s.height));
  if (el.width !== w) el.width = w;
  if (el.height !== h) el.height = h;
}

async function drawTextureToCanvas() {
  const el = canvas.value;
  if (!el) return;
  ensureCanvasSize();
  const ctx = el.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, el.width, el.height);

  const tex = currentTex.value;
  if (!tex?.dataBase64 || !tex?.mimeType) {
    // Default: mid gray (a usable starting point)
    ctx.fillStyle = "rgb(128,128,128)";
    ctx.fillRect(0, 0, el.width, el.height);
    return;
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode"));
    img.src = `data:${tex.mimeType};base64,${tex.dataBase64}`;
  });
  ctx.drawImage(img, 0, 0, el.width, el.height);
}

function canvasPointFromClient(e: PointerEvent): { x: number; y: number } | null {
  const el = canvas.value;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) * (el.width / Math.max(1, r.width));
  const y = (e.clientY - r.top) * (el.height / Math.max(1, r.height));
  return { x, y };
}

function strokeAt(x: number, y: number) {
  const el = canvas.value;
  if (!el) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const img = ctx.getImageData(0, 0, el.width, el.height);
  const data = img.data;
  const r = brushRadius.value;
  const r2 = r * r;
  const strength = clamp01(brushStrength.value);
  const target = brushSubtract.value ? 0 : 1;

  const minX = Math.max(0, Math.floor(x - r - 1));
  const maxX = Math.min(el.width - 1, Math.ceil(x + r + 1));
  const minY = Math.max(0, Math.floor(y - r - 1));
  const maxY = Math.min(el.height - 1, Math.ceil(y + r + 1));

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const falloff = 1 - Math.sqrt(d2 / Math.max(1e-9, r2));
      const a = strength * falloff;
      const idx = (py * el.width + px) * 4;
      const cur = data[idx]! / 255;
      const next = cur * (1 - a) + target * a;
      const v = Math.round(clamp01(next) * 255);
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function onPointerDown(e: PointerEvent) {
  const el = canvas.value;
  if (!el || !props.open) return;
  el.setPointerCapture(e.pointerId);
  drawing.value = { pointerId: e.pointerId };
  const p = canvasPointFromClient(e);
  if (!p) return;
  lastPos.value = p;
  strokeAt(p.x, p.y);
}

function onPointerMove(e: PointerEvent) {
  if (!drawing.value || drawing.value.pointerId !== e.pointerId) return;
  const p = canvasPointFromClient(e);
  if (!p) return;
  const prev = lastPos.value;
  lastPos.value = p;
  if (!prev) {
    strokeAt(p.x, p.y);
    return;
  }
  // Interpolate for continuous line.
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  const dist = Math.hypot(dx, dy);
  const step = Math.max(1, brushRadius.value * 0.35);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    strokeAt(prev.x + dx * t, prev.y + dy * t);
  }
}

function onPointerUp(e: PointerEvent) {
  const el = canvas.value;
  if (el && drawing.value?.pointerId === e.pointerId) {
    el.releasePointerCapture(e.pointerId);
  }
  if (!drawing.value || drawing.value.pointerId !== e.pointerId) return;
  drawing.value = null;
  lastPos.value = null;
  commitToProject();
}

function commitToProject() {
  const el = canvas.value;
  const s = slice.value;
  if (!el || !s) return;
  const mimeType = "image/png";
  const dataUrl = el.toDataURL(mimeType);
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return;
  const dataBase64 = m[2]!.replace(/\s/g, "");
  store.dispatch({
    type: "setCharacterRigSliceDepthTexture",
    sliceId: s.id,
    side: props.side,
    mimeType,
    dataBase64,
    pixelWidth: el.width,
    pixelHeight: el.height,
  });
}

function clearTexture() {
  const s = slice.value;
  if (!s) return;
  store.dispatch({ type: "clearCharacterRigSliceDepthTexture", sliceId: s.id, side: props.side });
  void drawTextureToCanvas();
}

function close() {
  emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

watch(
  () => [props.open, props.sliceId, props.side] as const,
  ([open]) => {
    if (!open) return;
    void drawTextureToCanvas();
  },
  { immediate: true },
);

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <Teleport to="body">
    <div v-if="open && sliceId && slice" class="overlay" role="dialog" aria-modal="true" @click.self="close">
      <div class="dialog" @click.stop>
        <header class="head">
          <h3 class="title">Edit depth texture · {{ slice.name }} · {{ side }}</h3>
          <button type="button" class="close" title="Close (Esc)" @click="close">×</button>
        </header>
        <div class="body">
          <div class="canvas-wrap">
            <canvas
              ref="canvas"
              class="canvas"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
            />
          </div>
          <aside class="tools">
            <label class="lbl"
              >Radius
              <input v-model.number="brushRadius" class="num" type="number" min="1" step="1" />
            </label>
            <label class="lbl"
              >Strength
              <input v-model.number="brushStrength" class="num" type="number" min="0" max="1" step="0.02" />
            </label>
            <label class="chk">
              <input v-model="brushSubtract" type="checkbox" />
              Subtract (paint black)
            </label>
            <button type="button" class="ghost" @click="clearTexture">Clear</button>
            <p class="muted">
              White = full height (mapped to max depth), black = 0. Saves automatically on pointer up.
            </p>
          </aside>
        </div>
        <footer class="foot">
          <button type="button" class="primary" @click="close">Done</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  z-index: 2000;
}
.dialog {
  width: min(980px, 95vw);
  height: min(720px, 90vh);
  background: #121318;
  border: 1px solid #2a2f3a;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto 1fr auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid #232733;
}
.title {
  margin: 0;
  font-size: 0.95rem;
}
.close {
  width: 34px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid #2b3140;
  background: #171a22;
  color: #cbd5e1;
}
.body {
  display: grid;
  grid-template-columns: 1fr 240px;
  min-height: 0;
}
.canvas-wrap {
  display: grid;
  place-items: center;
  background: #0f1014;
  min-height: 0;
}
.canvas {
  image-rendering: pixelated;
  width: min(720px, 70vw);
  height: auto;
  background: #000;
  border: 1px solid #2a2f3a;
}
.tools {
  border-left: 1px solid #232733;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lbl {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.num {
  width: 100%;
  background: #0f1117;
  border: 1px solid #2a2f3a;
  color: #e5e7eb;
  padding: 0.35rem 0.45rem;
  border-radius: 8px;
}
.chk {
  font-size: 0.85rem;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.muted {
  color: #9aa3b2;
  font-size: 0.82rem;
  line-height: 1.25rem;
}
.foot {
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #232733;
  display: flex;
  justify-content: flex-end;
}
.primary,
.ghost {
  border-radius: 10px;
  border: 1px solid #2a2f3a;
  padding: 0.45rem 0.7rem;
  color: #e5e7eb;
  background: #1a1f2a;
}
.primary {
  background: #4f46e5;
  border-color: #4338ca;
}
</style>

