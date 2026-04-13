<script setup lang="ts">
import {
  addBoneWeightDelta,
  deformSkinnedMesh,
  worldBindBoneMatrices,
  worldPoseBoneMatrices,
  worldPoseOriginsWithIk,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { onMounted, ref, shallowRef, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";

type BrushStroke = {
  meshId: string;
  working: SkinInfluence[][];
  touched: Set<number>;
};

const store = useEditorStore();
const {
  project,
  currentTime,
  selectedBoneId,
  selectedMeshId,
  selectedVertexIndex,
  weightBrushEnabled,
  weightBrushRadius,
  weightBrushStrength,
  weightBrushSubtract,
} = storeToRefs(store);

const canvas = ref<HTMLCanvasElement | null>(null);
const referenceBitmap = shallowRef<HTMLImageElement | null>(null);
const brushStroke = ref<BrushStroke | null>(null);

function meshForRender(mesh: SkinnedMesh): SkinnedMesh {
  if (brushStroke.value && brushStroke.value.meshId === mesh.id) {
    return { ...mesh, influences: brushStroke.value.working };
  }
  return mesh;
}

watch(
  () => project.value.referenceImage,
  (ri) => {
    referenceBitmap.value = null;
    if (!ri?.dataBase64 || !ri.mimeType) return;
    const img = new Image();
    img.onload = () => {
      referenceBitmap.value = img;
      draw();
    };
    img.onerror = () => {
      referenceBitmap.value = null;
      draw();
    };
    img.src = `data:${ri.mimeType};base64,${ri.dataBase64}`;
  },
  { immediate: true },
);

function draw() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, w, h);
  const refImg = referenceBitmap.value;
  if (refImg && refImg.complete && refImg.naturalWidth > 0) {
    const iw = refImg.naturalWidth;
    const ih = refImg.naturalHeight;
    const scale = Math.min(w / iw, h / ih) * 0.98;
    const dw = iw * scale;
    const dh = ih * scale;
    const x = (w - dw) / 2;
    const y = (h - dh) / 2;
    ctx.drawImage(refImg, x, y, dw, dh);
  }
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const gridAlpha = refImg && refImg.complete && refImg.naturalWidth > 0 ? 0.22 : 1;
  ctx.strokeStyle = `rgba(51,51,51,${gridAlpha})`;
  for (let x = -400; x <= 400; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, -400);
    ctx.lineTo(x, 400);
    ctx.stroke();
  }
  for (let y = -400; y <= 400; y += 40) {
    ctx.beginPath();
    ctx.moveTo(-400, y);
    ctx.lineTo(400, y);
    ctx.stroke();
  }

  const skinMeshes = project.value.skinnedMeshes ?? [];
  const bindM = worldBindBoneMatrices(project.value);
  const poseM = worldPoseBoneMatrices(project.value, currentTime.value);

  if (skinMeshes.length > 0) {
    ctx.fillStyle = "rgba(100, 140, 220, 0.35)";
    ctx.strokeStyle = "rgba(140, 170, 240, 0.55)";
    ctx.lineWidth = 1;
    for (const mesh of skinMeshes) {
      const m = meshForRender(mesh);
      const deformed = deformSkinnedMesh(m, bindM, poseM);
      for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
        const i0 = mesh.indices[t]!;
        const i1 = mesh.indices[t + 1]!;
        const i2 = mesh.indices[t + 2]!;
        const p0 = deformed[i0];
        const p1 = deformed[i1];
        const p2 = deformed[i2];
        if (!p0 || !p1 || !p2) continue;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  const origins = worldPoseOriginsWithIk(project.value, currentTime.value);
  const bones = project.value.bones;
  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 2;
  for (const b of bones) {
    if (b.parentId === null) continue;
    const p0 = origins.get(b.parentId);
    const p1 = origins.get(b.id);
    if (!p0 || !p1) continue;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  for (const b of bones) {
    const o = origins.get(b.id);
    if (!o) continue;
    const sel = b.id === selectedBoneId.value;
    ctx.fillStyle = sel ? "#a5b4fc" : "#22c55e";
    ctx.beginPath();
    ctx.arc(o.x, o.y, sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const smId = selectedMeshId.value;
  const sv = selectedVertexIndex.value;
  if (smId !== null && sv !== null && skinMeshes.length > 0) {
    const mesh = skinMeshes.find((m) => m.id === smId);
    if (mesh && sv >= 0 && sv < mesh.vertices.length) {
      const m = meshForRender(mesh);
      const deformed = deformSkinnedMesh(m, bindM, poseM);
      const pv = deformed[sv];
      if (pv) {
        ctx.strokeStyle = "#fbbf24";
        ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pv.x, pv.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function worldFromClient(e: PointerEvent, c: HTMLCanvasElement) {
  const rect = c.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  return { wx: mx - c.width / 2, wy: my - c.height / 2 };
}

function targetBrushMeshId(): string | null {
  const meshes = project.value.skinnedMeshes ?? [];
  if (meshes.length === 0) return null;
  if (selectedMeshId.value && meshes.some((m) => m.id === selectedMeshId.value)) {
    return selectedMeshId.value;
  }
  return meshes[0]!.id;
}

function applyBrushAt(wx: number, wy: number) {
  const st = brushStroke.value;
  const boneId = selectedBoneId.value;
  if (!st || !boneId) return;
  const mesh = project.value.skinnedMeshes?.find((m) => m.id === st.meshId);
  if (!mesh) return;
  const bindM = worldBindBoneMatrices(project.value);
  const poseM = worldPoseBoneMatrices(project.value, currentTime.value);
  const tmp: SkinnedMesh = { ...mesh, influences: st.working };
  const deformed = deformSkinnedMesh(tmp, bindM, poseM);
  const r = weightBrushRadius.value;
  const r2 = r * r;
  const str = weightBrushStrength.value * (weightBrushSubtract.value ? -1 : 1);
  const boneIds = new Set(project.value.bones.map((b) => b.id));
  for (let vi = 0; vi < deformed.length; vi++) {
    const pt = deformed[vi]!;
    const dx = pt.x - wx;
    const dy = pt.y - wy;
    if (dx * dx + dy * dy <= r2) {
      st.working[vi] = addBoneWeightDelta(st.working[vi] ?? [], boneId, str, boneIds);
      st.touched.add(vi);
    }
  }
}

function commitBrushStroke() {
  const st = brushStroke.value;
  brushStroke.value = null;
  if (!st || st.touched.size === 0) return;
  const updates = [...st.touched]
    .sort((a, b) => a - b)
    .map((vi) => ({ vertexIndex: vi, influences: st.working[vi] ?? [] }));
  store.dispatch({ type: "setMeshVerticesInfluences", meshId: st.meshId, updates });
}

function onCanvasPointerDown(e: PointerEvent) {
  const c = canvas.value;
  if (!c) return;

  if (weightBrushEnabled.value && selectedBoneId.value) {
    const mid = targetBrushMeshId();
    if (!mid) return;
    const mesh = project.value.skinnedMeshes?.find((m) => m.id === mid);
    if (!mesh) return;
    e.preventDefault();
    brushStroke.value = {
      meshId: mid,
      working: structuredClone(mesh.influences),
      touched: new Set(),
    };
    const { wx, wy } = worldFromClient(e, c);
    applyBrushAt(wx, wy);
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draw();
    return;
  }

  const meshes = project.value.skinnedMeshes ?? [];
  if (meshes.length === 0) {
    store.clearMeshVertexSelection();
    return;
  }
  const { wx, wy } = worldFromClient(e, c);
  const bindM = worldBindBoneMatrices(project.value);
  const poseM = worldPoseBoneMatrices(project.value, currentTime.value);
  const threshold2 = 20 * 20;
  let bestD2 = threshold2;
  let best: { meshId: string; vi: number } | null = null;
  for (const mesh of meshes) {
    const deformed = deformSkinnedMesh(mesh, bindM, poseM);
    for (let vi = 0; vi < deformed.length; vi++) {
      const pt = deformed[vi]!;
      const dx = pt.x - wx;
      const dy = pt.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { meshId: mesh.id, vi };
      }
    }
  }
  if (best) store.selectMeshVertex(best.meshId, best.vi);
  else store.clearMeshVertexSelection();
}

function onCanvasPointerMove(e: PointerEvent) {
  if (!brushStroke.value) return;
  const c = canvas.value;
  if (!c) return;
  e.preventDefault();
  const { wx, wy } = worldFromClient(e, c);
  applyBrushAt(wx, wy);
  draw();
}

function onCanvasPointerUp(e: PointerEvent) {
  if (!brushStroke.value) return;
  const c = canvas.value;
  if (c?.hasPointerCapture(e.pointerId)) {
    c.releasePointerCapture(e.pointerId);
  }
  commitBrushStroke();
  draw();
}

onMounted(() => {
  const c = canvas.value;
  if (!c) return;
  const ro = new ResizeObserver(() => {
    const p = c.parentElement;
    if (!p) return;
    c.width = p.clientWidth;
    c.height = p.clientHeight;
    draw();
  });
  ro.observe(c.parentElement!);
});

watch(
  [
    project,
    currentTime,
    selectedBoneId,
    selectedMeshId,
    selectedVertexIndex,
    weightBrushEnabled,
    weightBrushRadius,
    weightBrushStrength,
    weightBrushSubtract,
  ],
  draw,
  { deep: true },
);
watch(referenceBitmap, draw);
watch(brushStroke, draw);
</script>

<template>
  <div class="viewport">
    <canvas
      ref="canvas"
      class="cv"
      :class="{ brush: weightBrushEnabled }"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointercancel="onCanvasPointerUp"
    />
    <div class="hint">
      {{
        weightBrushEnabled
          ? "Pinsel: gewählter Knochen · Ziehen im Viewport (ein Undo pro Strich)"
          : "Y unten · Vertex für Gewichte anklicken"
      }}
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
}
.cv {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  touch-action: none;
}
.cv.brush {
  cursor: cell;
}
.hint {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 0.7rem;
  color: #555;
  max-width: 90%;
}
</style>
