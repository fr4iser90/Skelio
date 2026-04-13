<script setup lang="ts">
import { worldPoseOrigins } from "@skelio/domain";
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";

const store = useEditorStore();
const { project, currentTime, selectedBoneId } = storeToRefs(store);
const canvas = ref<HTMLCanvasElement | null>(null);

function draw() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = "#121316";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, 1);
  ctx.strokeStyle = "#333";
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
  const origins = worldPoseOrigins(project.value, currentTime.value);
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
  ctx.restore();
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

watch([project, currentTime, selectedBoneId], draw, { deep: true });
</script>

<template>
  <div class="viewport">
    <canvas ref="canvas" class="cv" />
    <div class="hint">Y unten · Zeitanimation in Timeline</div>
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
}
.hint {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 0.7rem;
  color: #555;
}
</style>
