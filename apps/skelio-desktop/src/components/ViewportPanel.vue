<script setup lang="ts">
import {
  addBoneWeightDelta,
  boneLengthAndBindRotationFromWorldTip,
  deformSkinnedMesh,
  localBindTranslationForWorldOrigin,
  localTranslationForWorldJointAtPoseTime,
  worldBindBoneMatrices,
  worldBindBoneMatricesOverridingBindPose,
  BONE_LENGTH_HIT_MIN_LOCAL,
  worldBindBoneTipForLengthHit,
  worldBindOrigins,
  worldPoseBoneMatrices,
  worldPoseOriginsWithIk,
  RIG_SLICE_MESH_ID_PREFIX,
  type CharacterRigSpriteSlice,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
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
  selectedCharacterRigSliceId,
  weightBrushEnabled,
  weightBrushRadius,
  weightBrushStrength,
  weightBrushSubtract,
  characterRigModalOpen,
  characterRigModalStep,
  pendingBonePlacementId,
  rigCameraWorldYScale,
} = storeToRefs(store);

/** Y-Stauchung nur im Character-Rig-Modal (Pseudo-2.5D/3D). */
const rigWorldYCompress = computed(() =>
  characterRigModalOpen.value ? rigCameraWorldYScale.value : 1,
);

const canvas = ref<HTMLCanvasElement | null>(null);
const referenceBitmap = shallowRef<HTMLImageElement | null>(null);
/** Decoded sprite sheets by id (rect slices reference `sheetId`). */
const rigSheetBitmaps = shallowRef(new Map<string, HTMLImageElement>());
/** Per-slice embedded imports (PNG/WebP). */
const embeddedRigImages = shallowRef(new Map<string, HTMLImageElement>());
const brushStroke = ref<BrushStroke | null>(null);
/** Dragging a rig slice: grab offset from pointer to slice center. */
const rigSliceDrag = ref<{ sliceId: string; grabDx: number; grabDy: number } | null>(null);
/** Live position while dragging (before commit). */
const rigSlicePreview = ref<{ id: string; cx: number; cy: number } | null>(null);
/** Bone drag: rig modal bone step = bind pose; main animator = TX/TY keys (see `animGrab`). */
const boneDrag = ref<{
  boneId: string;
  /** Main animator: pointer-down joint vs cursor so the joint does not snap to the cursor on first move. */
  animGrab?: { j0x: number; j0y: number; p0x: number; p0y: number };
} | null>(null);
/**
 * Spitze ziehen: Live-Vorschau (Länge + Bind-Rotation zur Maus), Commit beim Loslassen (ein Undo).
 */
const boneLengthDrag = ref<{
  boneId: string;
  startLength: number;
  startRotation: number;
  previewLength: number;
  previewRotation: number;
  pointerId: number;
} | null>(null);

const rigModalBoneStep = computed(
  () => characterRigModalOpen.value && characterRigModalStep.value === 1,
);

/** Nach „Meshes aus Rig“: Teile folgen dem Skinning — keine freien Slice-Züge mehr in der Hauptansicht. */
const mainViewSliceDragEnabled = computed(
  () => !(project.value.skinnedMeshes ?? []).some((m) => m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX)),
);

const viewportHintText = computed(() => {
  if (weightBrushEnabled.value) {
    return "Weight brush: selected bone · paint in the viewport (one undo per stroke)";
  }
  if (!characterRigModalOpen.value) {
    return "Animator: set time on the timeline · drag on a bound sprite or bone — TX/TY keys (joint follows cursor smoothly, no snap) · wheel = zoom · Alt+left = pan · right-drag = rotate view";
  }
  if (characterRigModalOpen.value && rigCameraWorldYScale.value < 0.999) {
    return "Kamera: Y gestaucht (Pseudo-Tiefe) — gleiche Logik für Klicks · Rad = Zoom";
  }
  if (rigModalBoneStep.value) {
    if (pendingBonePlacementId.value) {
      return "Klick in die Fläche = neuen Knochen platzieren (orange Kreis) · Rad = Zoom";
    }
    return "Knochen: Spitze/Shift+Gelenk ziehen (Richtung + Länge) · Loslassen = übernehmen · Esc = abbrechen · Rad = Zoom · Alt+Links = schieben · Rechts = drehen";
  }
  if ((project.value.characterRig?.slices?.length ?? 0) > 0) {
    if (!mainViewSliceDragEnabled.value) {
      return "Rig-Meshes aktiv: Knochen ziehen (Keys) — keine freien Slices. Rad = Zoom · Alt+Links = schieben · Rechts = drehen";
    }
    return "Rad = Zoom · Mitte oder Alt+Links = schieben · Rechts = drehen · Slices mit Links ziehen";
  }
  return "Rad = Zoom · Mitte oder Alt+Links = schieben · Rechts = drehen · Y unten · Vertex für Gewichte";
});

function hitTestBoneTip(wx: number, wy: number, radiusWorld: number): string | null {
  const r2 = radiusWorld * radiusWorld;
  let best: string | null = null;
  let bestD = r2;
  for (const b of project.value.bones) {
    const t = worldBindBoneTipForLengthHit(project.value, b.id);
    if (!t) continue;
    const d = (t.x - wx) ** 2 + (t.y - wy) ** 2;
    if (d <= r2 && d < bestD) {
      bestD = d;
      best = b.id;
    }
  }
  return best;
}

/** Effektive Länge zum Zeichnen / Griff (Vorschau beim Ziehen). */
function lengthForBoneDraw(b: { id: string; length: number }): number {
  const d = boneLengthDrag.value;
  if (d && d.boneId === b.id) return d.previewLength;
  return b.length;
}

/** Sichtbare Stablänge im Rig-Schritt: Mini-Stab wenn gewählt und Länge ~0 (z. B. Wurzel). */
function lengthForBoneVisual(
  b: { id: string; length: number },
  selectedId: string | null,
  rigBoneStep: boolean,
): number {
  const L = lengthForBoneDraw(b);
  if (rigBoneStep && b.id === selectedId && L < 1e-6) {
    return BONE_LENGTH_HIT_MIN_LOCAL;
  }
  return L;
}

function releaseBoneLengthPointerCapture(pointerId: number) {
  const c = canvas.value;
  if (c?.hasPointerCapture(pointerId)) {
    try {
      c.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }
}

function beginBoneLengthDrag(boneId: string, wx: number, wy: number, e: PointerEvent, c: HTMLCanvasElement) {
  store.selectBone(boneId);
  const b = project.value.bones.find((x) => x.id === boneId);
  const startLen = b?.length ?? 0;
  const startRot = b?.bindPose.rotation ?? 0;
  const tip = b ? boneLengthAndBindRotationFromWorldTip(project.value, boneId, wx, wy) : null;
  boneLengthDrag.value = {
    boneId,
    startLength: startLen,
    startRotation: startRot,
    previewLength: tip?.length ?? startLen,
    previewRotation: tip?.rotation ?? startRot,
    pointerId: e.pointerId,
  };
  try {
    c.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function cancelBoneLengthPreview() {
  const d = boneLengthDrag.value;
  if (!d) return;
  boneLengthDrag.value = null;
  releaseBoneLengthPointerCapture(d.pointerId);
  draw();
}

function onLengthDragEscapeKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (!boneLengthDrag.value) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  cancelBoneLengthPreview();
}

function hitTestBone(wx: number, wy: number, radiusWorld: number): string | null {
  const origins = worldBindOrigins(project.value);
  const r2 = radiusWorld * radiusWorld;
  let best: string | null = null;
  let bestD = r2;
  for (const b of project.value.bones) {
    const o = origins.get(b.id);
    if (!o) continue;
    const d = (o.x - wx) ** 2 + (o.y - wy) ** 2;
    if (d <= r2 && d < bestD) {
      bestD = d;
      best = b.id;
    }
  }
  return best;
}

function distPointToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-12) return (px - ax) ** 2 + (py - ay) ** 2;
  let t = ((px - ax) * abx + (py - ay) * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return (px - qx) ** 2 + (py - qy) ** 2;
}

/**
 * Main editor (animator): pick by joint **or** by distance to the posed bone segment (joint → tip).
 * Joints alone are tiny under full sprites; segment picking matches what you see as the grey bone line.
 */
function hitTestBoneAnimator(wx: number, wy: number): string | null {
  const origins = worldPoseOriginsWithIk(project.value, currentTime.value);
  const mats = worldPoseBoneMatrices(project.value, currentTime.value);
  const jointR2 = 48 * 48;
  const segMaxD2 = 40 * 40;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const b of project.value.bones) {
    const joint = origins.get(b.id);
    const M = mats.get(b.id);
    if (!joint || !M) continue;
    const dJoint = (wx - joint.x) ** 2 + (wy - joint.y) ** 2;
    let dSeg = Infinity;
    if (b.length > 1e-6) {
      const dx = M.a;
      const dy = M.b;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const tipX = joint.x + ux * b.length;
      const tipY = joint.y + uy * b.length;
      dSeg = distPointToSegmentSq(wx, wy, joint.x, joint.y, tipX, tipY);
    }
    const jointHit = dJoint <= jointR2;
    const segHit = b.length > 1e-6 && dSeg <= segMaxD2;
    if (!jointHit && !segHit) continue;
    const score = Math.min(dJoint, dSeg);
    if (score < bestScore) {
      bestScore = score;
      best = b.id;
    }
  }
  return best;
}

function tryPlacePendingBoneAt(wx: number, wy: number): boolean {
  const id = pendingBonePlacementId.value;
  if (!id) return false;
  const local = localBindTranslationForWorldOrigin(project.value, id, wx, wy);
  if (!local) return false;
  const ok = store.dispatch({ type: "setBindPose", boneId: id, partial: { x: local.x, y: local.y } });
  if (ok) store.setPendingBonePlacement(null);
  return ok;
}

/** 2D-Viewport: Pan (Bildschirm px), Zoom, Rotation (rad) — gleiche Welt wie Knochen/Rig. */
const viewPanX = ref(0);
const viewPanY = ref(0);
const viewZoom = ref(1);
const viewRotation = ref(0);
const viewDrag = ref<{ kind: "pan" | "rotate"; lastX: number; lastY: number } | null>(null);

const zoomPercent = computed(() => Math.round(viewZoom.value * 100));

function resetViewportView() {
  viewPanX.value = 0;
  viewPanY.value = 0;
  viewZoom.value = 1;
  viewRotation.value = 0;
  draw();
}

function zoomViewportIn() {
  viewZoom.value = Math.min(14, viewZoom.value * 1.12);
  draw();
}

function zoomViewportOut() {
  viewZoom.value = Math.max(0.12, viewZoom.value / 1.12);
  draw();
}

function worldFromClientPx(mx: number, my: number, c: HTMLCanvasElement) {
  const w = c.width;
  const h = c.height;
  const x = mx - w / 2 - viewPanX.value;
  const y = my - h / 2 - viewPanY.value;
  const rot = viewRotation.value;
  const c0 = Math.cos(rot);
  const s0 = Math.sin(rot);
  const z = viewZoom.value;
  let wx = (x * c0 + y * s0) / z;
  let wy = (-x * s0 + y * c0) / z;
  const ky = rigWorldYCompress.value;
  if (Math.abs(ky - 1) > 1e-6) wy /= ky;
  return { wx, wy };
}

/** Sichtbarer Welt-Ausschnitt (für Raster + Hintergrund), leicht erweitert. */
function visibleWorldBounds(c: HTMLCanvasElement, marginWorld: number) {
  const w = c.width;
  const h = c.height;
  if (w <= 0 || h <= 0) {
    return { minX: -400, maxX: 400, minY: -400, maxY: 400 };
  }
  const padPx = 64;
  const corners: [number, number][] = [
    [-padPx, -padPx],
    [w + padPx, -padPx],
    [w + padPx, h + padPx],
    [-padPx, h + padPx],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [mx, my] of corners) {
    const p = worldFromClientPx(mx, my, c);
    minX = Math.min(minX, p.wx);
    maxX = Math.max(maxX, p.wx);
    minY = Math.min(minY, p.wy);
    maxY = Math.max(maxY, p.wy);
  }
  minX -= marginWorld;
  maxX += marginWorld;
  minY -= marginWorld;
  maxY += marginWorld;
  return { minX, maxX, minY, maxY };
}

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

watch(
  () => project.value.characterRig?.spriteSheets,
  (sheets) => {
    const m = new Map(rigSheetBitmaps.value);
    const keep = new Set((sheets ?? []).map((s) => s.id));
    for (const k of m.keys()) {
      if (!keep.has(k)) m.delete(k);
    }
    rigSheetBitmaps.value = m;
    for (const sh of sheets ?? []) {
      if (rigSheetBitmaps.value.has(sh.id)) continue;
      const id = sh.id;
      const img = new Image();
      img.onload = () => {
        const nm = new Map(rigSheetBitmaps.value);
        nm.set(id, img);
        rigSheetBitmaps.value = nm;
        draw();
      };
      img.onerror = () => {
        draw();
      };
      img.src = `data:${sh.mimeType};base64,${sh.dataBase64}`;
    }
    draw();
  },
  { deep: true, immediate: true },
);

watch(
  () => project.value.characterRig?.slices,
  (slices) => {
    const m = new Map(embeddedRigImages.value);
    const keep = new Set<string>();
    for (const s of slices ?? []) {
      if (s.embedded) keep.add(s.id);
    }
    for (const k of m.keys()) {
      if (!keep.has(k)) m.delete(k);
    }
    embeddedRigImages.value = m;
    for (const s of slices ?? []) {
      if (!s.embedded) continue;
      if (embeddedRigImages.value.has(s.id)) continue;
      const id = s.id;
      const em = s.embedded;
      const img = new Image();
      img.onload = () => {
        const nm = new Map(embeddedRigImages.value);
        nm.set(id, img);
        embeddedRigImages.value = nm;
        draw();
      };
      img.src = `data:${em.mimeType};base64,${em.dataBase64}`;
    }
  },
  { deep: true, immediate: true },
);

function effectiveSliceCenter(s: CharacterRigSpriteSlice): { cx: number; cy: number } {
  const pr = rigSlicePreview.value;
  if (pr && pr.id === s.id) return { cx: pr.cx, cy: pr.cy };
  return { cx: s.worldCx, cy: s.worldCy };
}

function hitTestRigSlice(wx: number, wy: number): string | null {
  const slices = project.value.characterRig?.slices;
  if (!slices?.length) return null;
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.width <= 0 || s.height <= 0) continue;
    const { cx, cy } = effectiveSliceCenter(s);
    const hw = s.width / 2;
    const hh = s.height / 2;
    if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) return s.id;
  }
  return null;
}

function bindingBoneIdForSlice(sliceId: string): string | null {
  const rig = project.value.characterRig;
  const row = rig?.bindings?.find((x) => x.sliceId === sliceId);
  return row?.boneId ?? null;
}

function animatorBoneDragGrab(boneId: string, pwx: number, pwy: number): { j0x: number; j0y: number; p0x: number; p0y: number } {
  const j = worldPoseOriginsWithIk(project.value, currentTime.value).get(boneId);
  if (!j) return { j0x: pwx, j0y: pwy, p0x: pwx, p0y: pwy };
  return { j0x: j.x, j0y: j.y, p0x: pwx, p0y: pwy };
}

/** Topmost sprite rect under cursor that is bound to a bone (animator: drag drives TX/TY on that bone). */
function hitTestBoundRigSliceForAnimator(wx: number, wy: number): { sliceId: string; boneId: string } | null {
  const sid = hitTestRigSlice(wx, wy);
  if (!sid) return null;
  const boneId = bindingBoneIdForSlice(sid);
  if (!boneId) return null;
  return { sliceId: sid, boneId };
}

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
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.translate(viewPanX.value, viewPanY.value);
  ctx.rotate(viewRotation.value);
  ctx.scale(viewZoom.value, viewZoom.value);
  const kyDraw = rigWorldYCompress.value;
  if (Math.abs(kyDraw - 1) > 1e-6) ctx.scale(1, kyDraw);

  const vb = visibleWorldBounds(c, 120);
  ctx.fillStyle = "#16171c";
  ctx.fillRect(vb.minX, vb.minY, vb.maxX - vb.minX, vb.maxY - vb.minY);

  if (refImg && refImg.complete && refImg.naturalWidth > 0) {
    const iw = refImg.naturalWidth;
    const ih = refImg.naturalHeight;
    const scale = Math.min(w / iw, h / ih) * 0.98;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(refImg, -dw / 2, -dh / 2, dw, dh);
  }
  const gridAlpha = refImg && refImg.complete && refImg.naturalWidth > 0 ? 0.22 : 1;
  ctx.strokeStyle = `rgba(51,51,51,${gridAlpha})`;
  const gridStep = 40;
  const x0 = Math.floor(vb.minX / gridStep) * gridStep;
  const x1 = Math.ceil(vb.maxX / gridStep) * gridStep;
  const y0 = Math.floor(vb.minY / gridStep) * gridStep;
  const y1 = Math.ceil(vb.maxY / gridStep) * gridStep;
  for (let x = x0; x <= x1; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, vb.minY);
    ctx.lineTo(x, vb.maxY);
    ctx.stroke();
  }
  for (let y = y0; y <= y1; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(vb.minX, y);
    ctx.lineTo(vb.maxX, y);
    ctx.stroke();
  }

  const rig = project.value.characterRig;
  if (rig?.slices?.length) {
    const activeSliceId = selectedCharacterRigSliceId.value;
    for (const s of rig.slices) {
      if (s.width <= 0 || s.height <= 0) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      const dx = cx - s.width / 2;
      const dy = cy - s.height / 2;
      const isActive = activeSliceId !== null && s.id === activeSliceId;
      /** Mit Auswahl: aktives Teil voll, andere ausgegraut. Ohne Auswahl: alle sichtbar (auf Referenz legen). */
      const alpha = activeSliceId === null ? 1 : isActive ? 1 : 0.44;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (s.embedded) {
        const eimg = embeddedRigImages.value.get(s.id);
        if (eimg?.complete && eimg.naturalWidth > 0) {
          ctx.drawImage(eimg, dx, dy, s.width, s.height);
        }
      } else if (s.sheetId) {
        const rigImg = rigSheetBitmaps.value.get(s.sheetId);
        if (rigImg && rigImg.complete && rigImg.naturalWidth > 0) {
          ctx.drawImage(rigImg, s.x, s.y, s.width, s.height, dx, dy, s.width, s.height);
        }
      }
      ctx.restore();
    }
    ctx.save();
    for (const s of rig.slices) {
      if (s.width <= 0 || s.height <= 0) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      const dx = cx - s.width / 2;
      const dy = cy - s.height / 2;
      const sel = s.id === selectedCharacterRigSliceId.value;
      if (sel) {
        ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(dx - 1, dy - 1, s.width + 2, s.height + 2);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  const skinMeshes = project.value.skinnedMeshes ?? [];
  const bindM = worldBindBoneMatrices(project.value);
  const poseM = worldPoseBoneMatrices(project.value, currentTime.value);

  const lenDrag = boneLengthDrag.value;
  let boneM = rigModalBoneStep.value ? bindM : poseM;
  let boneO = rigModalBoneStep.value
    ? worldBindOrigins(project.value)
    : worldPoseOriginsWithIk(project.value, currentTime.value);
  if (rigModalBoneStep.value && lenDrag) {
    const b = project.value.bones.find((x) => x.id === lenDrag.boneId);
    if (b) {
      boneM = worldBindBoneMatricesOverridingBindPose(project.value, lenDrag.boneId, {
        ...b.bindPose,
        rotation: lenDrag.previewRotation,
      });
      boneO = new Map();
      for (const [id, m] of boneM) boneO.set(id, { x: m.e, y: m.f });
    }
  }
  const bones = project.value.bones;
  ctx.strokeStyle = "#6b7280";
  ctx.lineWidth = 2;
  const tipHandles: { x: number; y: number }[] = [];
  const selBid = selectedBoneId.value;
  const rigStep = rigModalBoneStep.value;
  for (const b of bones) {
    ctx.strokeStyle = "#6b7280";
    ctx.lineWidth = 2;
    const Lvis = lengthForBoneVisual(b, selBid, rigStep);
    if (Lvis <= 1e-9) continue;
    const M = boneM.get(b.id);
    const joint = boneO.get(b.id);
    if (!M || !joint) continue;
    const dx = M.a;
    const dy = M.b;
    const dd = dx * dx + dy * dy;
    let ux = 1;
    let uy = 0;
    if (dd > 1e-20) {
      const inv = 1 / Math.sqrt(dd);
      ux = dx * inv;
      uy = dy * inv;
    }
    const tipX = joint.x + ux * Lvis;
    const tipY = joint.y + uy * Lvis;
    const ghost = rigStep && b.id === selBid && lengthForBoneDraw(b) < 1e-6;
    if (ghost) {
      ctx.strokeStyle = "rgba(107, 114, 128, 0.45)";
      ctx.setLineDash([4, 4]);
    }
    ctx.beginPath();
    ctx.moveTo(joint.x, joint.y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (ghost) {
      ctx.setLineDash([]);
      ctx.strokeStyle = "#6b7280";
    }
    if (b.id === selBid && rigStep) {
      tipHandles.push({ x: tipX, y: tipY });
    }
  }
  for (const b of bones) {
    const o = boneO.get(b.id);
    if (!o) continue;
    const sel = b.id === selectedBoneId.value;
    ctx.fillStyle = sel ? "#a5b4fc" : "#22c55e";
    ctx.beginPath();
    ctx.arc(o.x, o.y, sel ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (tipHandles.length) {
    ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
    ctx.lineWidth = 2 / viewZoom.value;
    for (const t of tipHandles) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, 8 / viewZoom.value, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const pendId = pendingBonePlacementId.value;
  if (pendId && rigModalBoneStep.value) {
    const o = worldBindOrigins(project.value).get(pendId);
    if (o) {
      ctx.strokeStyle = "rgba(251, 146, 60, 0.95)";
      ctx.lineWidth = 2 / viewZoom.value;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(o.x, o.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
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
  return worldFromClientPx(mx, my, c);
}

function onWheelView(e: WheelEvent) {
  e.preventDefault();
  const z0 = viewZoom.value;
  const factor = e.deltaY > 0 ? 0.92 : 1.08;
  viewZoom.value = Math.min(14, Math.max(0.12, z0 * factor));
  draw();
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

  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    viewDrag.value = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draw();
    return;
  }
  if (e.button === 2) {
    e.preventDefault();
    viewDrag.value = { kind: "rotate", lastX: e.clientX, lastY: e.clientY };
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draw();
    return;
  }

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

  const { wx, wy } = worldFromClient(e, c);

  if (rigModalBoneStep.value && e.button === 0) {
    if (pendingBonePlacementId.value) {
      e.preventDefault();
      tryPlacePendingBoneAt(wx, wy);
      draw();
      return;
    }
    if (e.shiftKey) {
      const hitShift = hitTestBone(wx, wy, 18);
      if (hitShift) {
        e.preventDefault();
        beginBoneLengthDrag(hitShift, wx, wy, e, c);
        draw();
        return;
      }
    }
    const hitTip = hitTestBoneTip(wx, wy, 16);
    if (hitTip) {
      e.preventDefault();
      beginBoneLengthDrag(hitTip, wx, wy, e, c);
      draw();
      return;
    }
    const hitB = hitTestBone(wx, wy, 18);
    if (hitB) {
      e.preventDefault();
      store.selectBone(hitB);
      boneDrag.value = { boneId: hitB };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      draw();
      return;
    }
    store.selectCharacterRigSlice(null);
    rigSlicePreview.value = null;
    store.clearMeshVertexSelection();
    draw();
    return;
  }

  if (e.button === 0 && !characterRigModalOpen.value) {
    const hitPose = hitTestBoneAnimator(wx, wy);
    if (hitPose) {
      e.preventDefault();
      store.selectBone(hitPose);
      boneDrag.value = { boneId: hitPose, animGrab: animatorBoneDragGrab(hitPose, wx, wy) };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      draw();
      return;
    }
    const fromSprite = hitTestBoundRigSliceForAnimator(wx, wy);
    if (fromSprite) {
      e.preventDefault();
      store.selectCharacterRigSlice(fromSprite.sliceId);
      store.selectBone(fromSprite.boneId);
      boneDrag.value = { boneId: fromSprite.boneId, animGrab: animatorBoneDragGrab(fromSprite.boneId, wx, wy) };
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      draw();
      return;
    }
  }

  const hitSlice = mainViewSliceDragEnabled.value ? hitTestRigSlice(wx, wy) : null;
  if (hitSlice) {
    e.preventDefault();
    const slices = project.value.characterRig?.slices;
    const s = slices?.find((x) => x.id === hitSlice);
    if (!s) return;
    const { cx, cy } = effectiveSliceCenter(s);
    rigSliceDrag.value = { sliceId: hitSlice, grabDx: wx - cx, grabDy: wy - cy };
    rigSlicePreview.value = { id: hitSlice, cx, cy };
    store.selectCharacterRigSlice(hitSlice);
    store.clearMeshVertexSelection();
    try {
      c.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    draw();
    return;
  }

  store.selectCharacterRigSlice(null);
  rigSlicePreview.value = null;

  const meshes = project.value.skinnedMeshes ?? [];
  if (meshes.length === 0) {
    store.clearMeshVertexSelection();
    return;
  }
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
  const c = canvas.value;
  if (!c) return;

  if (viewDrag.value) {
    e.preventDefault();
    const d = viewDrag.value;
    if (d.kind === "pan") {
      const dx = e.clientX - d.lastX;
      const dy = e.clientY - d.lastY;
      viewPanX.value += dx;
      viewPanY.value += dy;
      viewDrag.value = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
    } else {
      const dx = e.clientX - d.lastX;
      viewRotation.value += dx * 0.007;
      viewDrag.value = { kind: "rotate", lastX: e.clientX, lastY: e.clientY };
    }
    draw();
    return;
  }

  if (boneLengthDrag.value) {
    e.preventDefault();
    const { wx, wy } = worldFromClient(e, c);
    const d = boneLengthDrag.value;
    const b = project.value.bones.find((x) => x.id === d.boneId);
    if (b) {
      const previewBind = { ...b.bindPose, rotation: d.previewRotation };
      const tip = boneLengthAndBindRotationFromWorldTip(project.value, d.boneId, wx, wy, previewBind);
      if (tip) {
        boneLengthDrag.value = {
          ...d,
          previewLength: tip.length,
          previewRotation: tip.rotation,
        };
      }
    }
    draw();
    return;
  }

  if (boneDrag.value) {
    e.preventDefault();
    const { wx, wy } = worldFromClient(e, c);
    if (rigModalBoneStep.value) {
      const local = localBindTranslationForWorldOrigin(project.value, boneDrag.value.boneId, wx, wy);
      if (local) {
        store.dispatch({ type: "setBindPose", boneId: boneDrag.value.boneId, partial: { x: local.x, y: local.y } });
      }
    } else {
      const g = boneDrag.value.animGrab;
      const twx = g ? g.j0x + (wx - g.p0x) : wx;
      const twy = g ? g.j0y + (wy - g.p0y) : wy;
      const local = localTranslationForWorldJointAtPoseTime(
        project.value,
        boneDrag.value.boneId,
        currentTime.value,
        twx,
        twy,
      );
      if (local) {
        store.dispatch({
          type: "setBoneTranslationKeysAtTime",
          boneId: boneDrag.value.boneId,
          t: currentTime.value,
          x: local.x,
          y: local.y,
        });
      }
    }
    draw();
    return;
  }

  if (rigSliceDrag.value) {
    e.preventDefault();
    const { wx, wy } = worldFromClient(e, c);
    const d = rigSliceDrag.value;
    rigSlicePreview.value = {
      id: d.sliceId,
      cx: wx - d.grabDx,
      cy: wy - d.grabDy,
    };
    draw();
    return;
  }

  if (!brushStroke.value) return;
  e.preventDefault();
  const { wx, wy } = worldFromClient(e, c);
  applyBrushAt(wx, wy);
  draw();
}

function onCanvasPointerUp(e: PointerEvent) {
  const c = canvas.value;

  if (viewDrag.value) {
    viewDrag.value = null;
    if (c?.hasPointerCapture(e.pointerId)) {
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    draw();
    return;
  }

  if (boneLengthDrag.value) {
    const d = boneLengthDrag.value;
    boneLengthDrag.value = null;
    const lenChanged = Math.abs(d.previewLength - d.startLength) > 1e-3;
    const rotChanged = Math.abs(d.previewRotation - d.startRotation) > 1e-6;
    if (lenChanged || rotChanged) {
      store.dispatch({
        type: "setBoneLengthAndBindRotation",
        boneId: d.boneId,
        length: d.previewLength,
        rotation: d.previewRotation,
      });
    }
    releaseBoneLengthPointerCapture(d.pointerId);
    draw();
    return;
  }

  if (boneDrag.value) {
    boneDrag.value = null;
    if (c?.hasPointerCapture(e.pointerId)) {
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    draw();
    return;
  }

  if (rigSliceDrag.value && rigSlicePreview.value) {
    const p = rigSlicePreview.value;
    store.dispatch({
      type: "setCharacterRigSliceWorldPosition",
      sliceId: rigSliceDrag.value.sliceId,
      worldCx: p.cx,
      worldCy: p.cy,
    });
    rigSliceDrag.value = null;
    rigSlicePreview.value = null;
    if (c?.hasPointerCapture(e.pointerId)) {
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    draw();
    return;
  }

  if (!brushStroke.value) return;
  if (c?.hasPointerCapture(e.pointerId)) {
    c.releasePointerCapture(e.pointerId);
  }
  commitBrushStroke();
  draw();
}

onMounted(() => {
  window.addEventListener("keydown", onLengthDragEscapeKey, true);
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

onUnmounted(() => {
  window.removeEventListener("keydown", onLengthDragEscapeKey, true);
});

watch(
  [
    project,
    currentTime,
    selectedBoneId,
    selectedMeshId,
    selectedVertexIndex,
    selectedCharacterRigSliceId,
    weightBrushEnabled,
    weightBrushRadius,
    weightBrushStrength,
    weightBrushSubtract,
    viewPanX,
    viewPanY,
    viewZoom,
    viewRotation,
    characterRigModalOpen,
    characterRigModalStep,
    pendingBonePlacementId,
    boneDrag,
    boneLengthDrag,
    rigCameraWorldYScale,
    rigWorldYCompress,
  ],
  draw,
  { deep: true },
);
watch(referenceBitmap, draw);
watch(rigSheetBitmaps, draw, { deep: true });
watch(brushStroke, draw);

function onCanvasPointerCancel(e: PointerEvent) {
  if (boneLengthDrag.value) {
    e.preventDefault();
    cancelBoneLengthPreview();
    return;
  }
  onCanvasPointerUp(e);
}
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
      @pointercancel="onCanvasPointerCancel"
      @wheel="onWheelView"
      @contextmenu.prevent
    />
    <div class="view-toolbar" aria-label="Viewport-Ansicht">
      <span class="view-toolbar-label">{{ zoomPercent }}%</span>
      <button type="button" class="view-tb-btn" title="Verkleinern" @click="zoomViewportOut">−</button>
      <button type="button" class="view-tb-btn" title="Vergrößern" @click="zoomViewportIn">+</button>
      <button type="button" class="view-tb-btn view-tb-reset" title="Ansicht zurücksetzen" @click="resetViewportView">Reset</button>
    </div>
    <div class="hint">{{ viewportHintText }}</div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.cv {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: block;
  cursor: crosshair;
  touch-action: none;
}
.cv.brush {
  cursor: cell;
}
.view-toolbar {
  position: absolute;
  top: 6px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  background: rgba(20, 21, 26, 0.85);
  border: 1px solid #3b3f48;
  font-size: 0.72rem;
  color: #9ca3af;
  z-index: 2;
}
.view-toolbar-label {
  min-width: 2.75rem;
  text-align: right;
  color: #d1d5db;
}
.view-tb-btn {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #2e3138;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1.2;
}
.view-tb-btn:hover {
  background: #3d424c;
}
.view-tb-reset {
  margin-left: 2px;
  font-size: 0.68rem;
}
.hint {
  position: absolute;
  bottom: 8px;
  left: 8px;
  max-width: min(92%, 28rem);
  padding: 0.35rem 0.55rem;
  border-radius: 6px;
  font-size: 0.68rem;
  line-height: 1.4;
  color: #94a3b8;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  pointer-events: none;
}
</style>
