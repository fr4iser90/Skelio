<script setup lang="ts">
import {
  addBoneWeightDelta,
  boneLengthAndBindRotationFromWorldTip,
  deformSkinnedMesh,
  evaluatePose,
  getFabrikIkChains,
  getLocalBoneState,
  getTwoBoneIkChains,
  localBindTranslationForWorldOrigin,
  mat4Invert,
  mat4ToMat2dProjection,
  resolveCharacterRigSliceBoundBoneId,
  RIG_SLICE_MESH_ID_PREFIX,
  rigidCharacterRigSliceWorldPose,
  rigSliceSkinnedMeshId,
  transformPointMat4,
  worldBindBoneMatrices4,
  worldBindBoneMatrices4OverridingBindPose,
  BONE_LENGTH_HIT_MIN_LOCAL,
  worldBindBoneTipForLengthHit,
  worldBindOrigins,
  sampleControlChannel,
  type CharacterRigConfig,
  type CharacterRigSpriteSlice,
  type Mat2D,
  type Mat4,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { drawRigSliceSkinnedDeformed } from "../drawRigSliceSkinnedMesh.js";
import { isTypingInEditableField } from "../viewportWasd.js";
import AnimatorThreeViewport from "./AnimatorThreeViewport.vue";

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
  quickRigMode,
  rigCameraWorldYScale,
  rigCameraViewKind,
  animatorRigMeshDeformOverlay,
  animatorDeformMeshDraw,
} = storeToRefs(store);

/** Y-Stauchung nur im Character-Setup-Wizard (Pseudo-2.5D/3D). */
const rigWorldYCompress = computed(() =>
  characterRigModalOpen.value ? rigCameraWorldYScale.value : 1,
);

/**
 * Cached solved pose for the current reactive frame (time/project).
 * Keeps `evaluatePose` as SSoT, but avoids multiple recalcs per draw / event handler.
 */
const solvedPose = computed(() => evaluatePose(project.value, currentTime.value, { applyIk: true }));

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
/** Bone drag: Setup-Wizard Bone-Schritt = Bind Pose; Haupt-Animator = TX/TY keys (see `animGrab`). */
const boneDrag = ref<{
  boneId: string;
  /** Main animator: pointer-down joint vs cursor so the joint does not snap to the cursor on first move. */
  animGrab?: { j0x: number; j0y: number; p0x: number; p0y: number };
  /** Animator interaction mode. */
  mode?: "rotate" | "translate";
  /** Rotate drag: angle around joint on pointer down. */
  rotGrab?: { a0: number; localRot0: number };
} | null>(null);

const ikControlDrag = ref<
  | {
      controlId: string;
      kind: "target" | "pole";
      pointerId: number;
      start: { x: number; y: number; poleX?: number; poleY?: number };
      preview: { x: number; y: number; poleX?: number; poleY?: number };
    }
  | null
>(null);

const selectedIkControlId = ref<string | null>(null);
/**
 * Spitze ziehen: Live-Vorschau (Länge + Bind-Rotation zur Maus), Commit beim Loslassen (ein Undo).
 */
const boneLengthDrag = ref<{
  boneId: string;
  startLength: number;
  startRotation: number;
  previewLength: number;
  previewRotation: number;
  /** World joint at pointer-down; keeps length drag stable while preview rotation updates. */
  jointWorldFix?: { x: number; y: number };
  pointerId: number;
} | null>(null);

const rigModalBoneStep = computed(
  () => characterRigModalOpen.value && characterRigModalStep.value === 1,
);

/** Bind-Pose-Interaktionen im Canvas: Wizard „Bones“-Schritt oder Quick Rig (Hauptfenster). */
const bindPoseViewportEditing = computed(() => rigModalBoneStep.value || quickRigMode.value);

const animatorTool = ref<"rotate" | "translate">("rotate");

/** Rig-Slices nur im Setup-Wizard (Schritt 0) ziehbar, nicht im Alltags-Animator. */
const mainViewSliceDragEnabled = computed(
  () => characterRigModalOpen.value && characterRigModalStep.value === 0,
);

const viewportHintText = computed(() => {
  if (weightBrushEnabled.value) {
    return "Weight brush: selected bone · paint in the viewport (one undo per stroke)";
  }
  if (!characterRigModalOpen.value) {
    if (quickRigMode.value) {
      if (pendingBonePlacementId.value) {
        return "Quick Rig: Klick in die Fläche = neuen Knochen platzieren (orange Kreis) · WASD = Ansicht · Rad = Zoom";
      }
      return "Quick Rig: Spitze/Shift+Gelenk … · Knochen ziehen = Bind X/Y · WASD = Ansicht · Esc = Längen-Vorschau abbrechen · Rad = Zoom · Alt+Links = schieben · Rechts = drehen";
    }
    return `Animator: tool=${animatorTool.value.toUpperCase()} · drag sprite/bone = ${animatorTool.value} keys · Shift = translate · G=translate · R=rotate · WASD = pan · wheel=zoom · Alt+left=pan · right-drag=rotate view`;
  }
  if (characterRigModalOpen.value && rigCameraWorldYScale.value < 0.999) {
    return "Character Setup: Kamera Y gestaucht (Pseudo-Tiefe) — gleiche Logik für Klicks · Rad = Zoom";
  }
  if (rigModalBoneStep.value) {
    if (pendingBonePlacementId.value) {
      return "Character Setup — Bones: Klick in die Fläche = neuen Knochen platzieren (orange Kreis) · Rad = Zoom";
    }
    return "Character Setup — Bones: Spitze/Shift+Gelenk ziehen (Richtung + Länge) · Loslassen = übernehmen · Esc = abbrechen · Rad = Zoom · Alt+Links = schieben · Rechts = drehen";
  }
  if ((project.value.characterRig?.slices?.length ?? 0) > 0) {
    if (!mainViewSliceDragEnabled.value) {
      return "Character Setup: Rig-Meshes aktiv — Knochen ziehen (Keys), keine freien Slices. Rad = Zoom · Alt+Links = schieben · Rechts = drehen";
    }
    return "Character Setup: Rad = Zoom · Mitte oder Alt+Links = schieben · Rechts = drehen · Slices mit Links ziehen";
  }
  return "Rad = Zoom · Mitte oder Alt+Links = schieben · Rechts = drehen · Y unten · Vertex für Gewichte";
});

const animatorUsesWebglViewport = computed(() => !characterRigModalOpen.value && rigCameraViewKind.value !== "2d");

/** Only break ties when tips are almost equally close — do not override a clearly nearer bone. */
const BIND_TIP_TIE_EPS2 = 28 * 28;

function boneDepthFromRootViewport(boneId: string): number {
  let depth = 0;
  let id: string | null = boneId;
  const byId = new Map(project.value.bones.map((b) => [b.id, b] as const));
  while (id) {
    const b = byId.get(id);
    if (!b) break;
    depth++;
    id = b.parentId;
  }
  return depth;
}

function hitTestBoneTip(wx: number, wy: number, radiusWorld: number): string | null {
  const r2 = radiusWorld * radiusWorld;
  const sel = selectedBoneId.value;
  const hits: { id: string; d2: number }[] = [];
  for (const b of project.value.bones) {
    const t = worldBindBoneTipForLengthHit(project.value, b.id);
    if (!t) continue;
    const d = (t.x - wx) ** 2 + (t.y - wy) ** 2;
    if (d <= r2) hits.push({ id: b.id, d2: d });
  }
  hits.sort((a, b) => {
    if (Math.abs(a.d2 - b.d2) > BIND_TIP_TIE_EPS2) {
      return a.d2 - b.d2;
    }
    const da = boneDepthFromRootViewport(a.id);
    const db = boneDepthFromRootViewport(b.id);
    if (da !== db) return db - da;
    if (a.id === sel && b.id !== sel) return -1;
    if (b.id === sel && a.id !== sel) return 1;
    return a.d2 - b.d2;
  });
  return hits[0]?.id ?? null;
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
  const J0 = worldBindOrigins(project.value).get(boneId);
  const tip = b ? boneLengthAndBindRotationFromWorldTip(project.value, boneId, wx, wy, undefined, J0) : null;
  boneLengthDrag.value = {
    boneId,
    startLength: startLen,
    startRotation: startRot,
    previewLength: tip?.length ?? startLen,
    previewRotation: tip?.rotation ?? startRot,
    ...(J0 ? { jointWorldFix: { x: J0.x, y: J0.y } } : {}),
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
  const sel = selectedBoneId.value;
  const hits: { id: string; d2: number }[] = [];
  for (const b of project.value.bones) {
    const o = origins.get(b.id);
    if (!o) continue;
    const d = (o.x - wx) ** 2 + (o.y - wy) ** 2;
    if (d <= r2) hits.push({ id: b.id, d2: d });
  }
  hits.sort((a, b) => {
    if (a.d2 !== b.d2) return a.d2 - b.d2;
    const da = boneDepthFromRootViewport(a.id);
    const db = boneDepthFromRootViewport(b.id);
    if (da !== db) return db - da;
    if (a.id === sel && b.id !== sel) return -1;
    if (b.id === sel && a.id !== sel) return 1;
    return 0;
  });
  return hits[0]?.id ?? null;
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
  const ps = solvedPose.value;
  const origins = ps.solvedOriginByBoneId;
  const mats = ps.solvedWorld2dByBoneId;
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

function mat4MapToMat2d(m4: Map<string, Mat4>): Map<string, Mat2D> {
  const o = new Map<string, Mat2D>();
  for (const [id, m] of m4) o.set(id, mat4ToMat2dProjection(m));
  return o;
}

/** Bind + Pose matrices for main viewport (slices + bones + mesh preview). */
function viewportBoneBindPoseAndDrawState(): {
  bindM4: Map<string, Mat4>;
  poseM4: Map<string, Mat4>;
  boneM4: Map<string, Mat4>;
  boneM: Map<string, Mat2D>;
  boneO: Map<string, { x: number; y: number }>;
} {
  const bindM4 = worldBindBoneMatrices4(project.value);
  const poseEval = solvedPose.value;
  const poseM4 = poseEval.solvedWorld4ByBoneId;
  const lenDrag = boneLengthDrag.value;
  let boneM4 = bindPoseViewportEditing.value ? bindM4 : poseM4;
  let boneO = bindPoseViewportEditing.value
    ? worldBindOrigins(project.value)
    : poseEval.solvedOriginByBoneId;
  if (bindPoseViewportEditing.value && lenDrag) {
    const b = project.value.bones.find((x) => x.id === lenDrag.boneId);
    if (b) {
      boneM4 = worldBindBoneMatrices4OverridingBindPose(project.value, lenDrag.boneId, {
        ...b.bindPose,
        rotation: lenDrag.previewRotation,
      });
      boneO = new Map();
      for (const [id, m] of boneM4) boneO.set(id, { x: m[12], y: m[13] });
    }
  }
  const boneM = mat4MapToMat2d(boneM4);
  return { bindM4, poseM4, boneM4, boneM, boneO };
}

function rigidSliceWorldPose(
  s: CharacterRigSpriteSlice,
  _rig: CharacterRigConfig,
  layoutCx: number,
  layoutCy: number,
  boneM4: Map<string, Mat4>,
): { cx: number; cy: number; rot: number } | null {
  const bid = resolveCharacterRigSliceBoundBoneId(project.value, s.id);
  if (!bid) return null;
  const binding = project.value.characterRig?.bindings?.find((b) => b.sliceId === s.id && b.boneId === bid) ?? null;
  return rigidCharacterRigSliceWorldPose(project.value, bid, layoutCx, layoutCy, boneM4, {
    localX: binding?.localX,
    localY: binding?.localY,
    localZ: binding?.localZ,
    rotOffset: binding?.rotOffset,
  });
}

function pointInRotatedSliceRect(
  wx: number,
  wy: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot: number,
): boolean {
  const dx = wx - cx;
  const dy = wy - cy;
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

function hitTestRigSlice(wx: number, wy: number): string | null {
  const slices = project.value.characterRig?.slices;
  if (!slices?.length) return null;
  const rig = project.value.characterRig!;
  const { boneM4 } = viewportBoneBindPoseAndDrawState();
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.width <= 0 || s.height <= 0) continue;
    const { cx, cy } = effectiveSliceCenter(s);
    const rigid = rigidSliceWorldPose(s, rig, cx, cy, boneM4);
    if (rigid) {
      if (pointInRotatedSliceRect(wx, wy, rigid.cx, rigid.cy, s.width, s.height, rigid.rot)) return s.id;
    } else {
      const hw = s.width / 2;
      const hh = s.height / 2;
      if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) return s.id;
    }
  }
  return null;
}

function bindingBoneIdForSlice(sliceId: string): string | null {
  return resolveCharacterRigSliceBoundBoneId(project.value, sliceId);
}

/**
 * If `boneId` is the IK-driven tip of an enabled chain, dragging translation must move the
 * chain target — not tx/ty on the bone (those fight the solver and detach sprites).
 */
function ikEffectorChainForBone(
  boneId: string,
): { kind: "two" | "fabrik"; chainId: string } | null {
  const p = project.value;
  for (const ch of getTwoBoneIkChains(p)) {
    if (ch.enabled && ch.tipBoneId === boneId) return { kind: "two", chainId: ch.id };
  }
  for (const ch of getFabrikIkChains(p)) {
    const last = ch.boneIds[ch.boneIds.length - 1];
    if (ch.enabled && last === boneId) return { kind: "fabrik", chainId: ch.id };
  }
  return null;
}

function dispatchIkChainWorldTarget(chainId: string, kind: "two" | "fabrik", twx: number, twy: number) {
  if (kind === "two") {
    store.dispatch({ type: "setIkChainTarget", chainId, targetX: twx, targetY: twy });
  } else {
    store.dispatch({ type: "setFabrikIkChainTarget", chainId, targetX: twx, targetY: twy });
  }
  const ctl = project.value.rig?.controls?.ikTargets2d?.find((c) => c.chainId === chainId);
  if (ctl) {
    store.dispatch({
      type: "setIkTargetControlBase",
      controlId: ctl.id,
      x: twx,
      y: twy,
      ...(typeof ctl.poleX === "number" && typeof ctl.poleY === "number"
        ? { poleX: ctl.poleX, poleY: ctl.poleY }
        : {}),
    });
  }
}

function animatorBoneDragGrab(boneId: string, pwx: number, pwy: number): { j0x: number; j0y: number; p0x: number; p0y: number } {
  const j = solvedPose.value.solvedOriginByBoneId.get(boneId);
  if (!j) return { j0x: pwx, j0y: pwy, p0x: pwx, p0y: pwy };
  return { j0x: j.x, j0y: j.y, p0x: pwx, p0y: pwy };
}

function angleAroundJoint(boneId: string, wx: number, wy: number): number {
  const j = solvedPose.value.solvedOriginByBoneId.get(boneId);
  const cx = j?.x ?? 0;
  const cy = j?.y ?? 0;
  return Math.atan2(wy - cy, wx - cx);
}

function beginAnimatorRotateDrag(boneId: string, wx: number, wy: number): { a0: number; localRot0: number } {
  const clip = project.value.clips.find((c) => c.id === project.value.activeClipId);
  const b = project.value.bones.find((x) => x.id === boneId)!;
  const s = getLocalBoneState(b, clip, currentTime.value);
  return { a0: angleAroundJoint(boneId, wx, wy), localRot0: s.rot };
}

/** Topmost sprite rect under cursor that is bound to a bone (animator: drag drives TX/TY on that bone). */
function hitTestBoundRigSliceForAnimator(wx: number, wy: number): { sliceId: string; boneId: string } | null {
  const sid = hitTestRigSlice(wx, wy);
  if (!sid) return null;
  const boneId = bindingBoneIdForSlice(sid);
  if (!boneId) return null;
  return { sliceId: sid, boneId };
}

function activeClipForControls() {
  return project.value.clips.find((c) => c.id === project.value.activeClipId);
}

function controlPoseNow(controlId: string, base: { x: number; y: number; poleX?: number; poleY?: number }) {
  const clip = activeClipForControls();
  const t = currentTime.value;
  const x = sampleControlChannel(clip, controlId, "x", t, base.x);
  const y = sampleControlChannel(clip, controlId, "y", t, base.y);
  const poleX = base.poleX != null ? sampleControlChannel(clip, controlId, "poleX", t, base.poleX) : undefined;
  const poleY = base.poleY != null ? sampleControlChannel(clip, controlId, "poleY", t, base.poleY) : undefined;
  return { x, y, ...(poleX != null && poleY != null ? { poleX, poleY } : {}) };
}

function hitTestIkControl(wx: number, wy: number): { controlId: string; kind: "target" | "pole" } | null {
  const ctls = project.value.rig?.controls?.ikTargets2d ?? [];
  if (ctls.length === 0) return null;
  const r = 14 / viewZoom.value;
  const r2 = r * r;
  for (const c of ctls) {
    if (!c.enabled) continue;
    const pose = controlPoseNow(c.id, { x: c.x, y: c.y, poleX: c.poleX, poleY: c.poleY });
    const dx = pose.x - wx;
    const dy = pose.y - wy;
    if (dx * dx + dy * dy <= r2) return { controlId: c.id, kind: "target" };
    if (pose.poleX != null && pose.poleY != null) {
      const px = pose.poleX;
      const py = pose.poleY;
      const dpx = px - wx;
      const dpy = py - wy;
      if (dpx * dpx + dpy * dpy <= r2) return { controlId: c.id, kind: "pole" };
    }
  }
  return null;
}

function keySelectedIkControlAtCurrentTime(): void {
  const id = selectedIkControlId.value;
  if (!id) return;
  const ctl = project.value.rig?.controls?.ikTargets2d?.find((c) => c.id === id);
  if (!ctl || !ctl.enabled) return;
  const t = currentTime.value;
  const pose = controlPoseNow(id, { x: ctl.x, y: ctl.y, poleX: ctl.poleX, poleY: ctl.poleY });
  store.dispatch({ type: "addIkTargetControlKeyframe", controlId: id, property: "x", t, v: pose.x });
  store.dispatch({ type: "addIkTargetControlKeyframe", controlId: id, property: "y", t, v: pose.y });
  if (pose.poleX != null && pose.poleY != null) {
    store.dispatch({ type: "addIkTargetControlKeyframe", controlId: id, property: "poleX", t, v: pose.poleX });
    store.dispatch({ type: "addIkTargetControlKeyframe", controlId: id, property: "poleY", t, v: pose.poleY });
  }
}

function draw() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext("2d");
  if (!ctx) return;
  const g = ctx;
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

  const skinMeshes = project.value.skinnedMeshes ?? [];
  const { bindM4, poseM4, boneM4 } = viewportBoneBindPoseAndDrawState();

  const rig = project.value.characterRig;
  if (rig?.slices?.length) {
    const activeSliceId = selectedCharacterRigSliceId.value;
    for (const s of rig.slices) {
      if (s.width <= 0 || s.height <= 0) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      const isActive = activeSliceId !== null && s.id === activeSliceId;
      const alpha = activeSliceId === null ? 1 : isActive ? 1 : 0.44;
      ctx.save();
      ctx.globalAlpha = alpha;

      const sliceMesh =
        animatorDeformMeshDraw.value && bindingBoneIdForSlice(s.id)
          ? skinMeshes.find((m) => m.id === rigSliceSkinnedMeshId(s.id))
          : undefined;
      let drewSkinned = false;
      if (sliceMesh) {
        const deformed = deformSkinnedMesh(sliceMesh, bindM4, poseM4);
        if (s.embedded) {
          const eimg = embeddedRigImages.value.get(s.id);
          if (eimg?.complete && eimg.naturalWidth > 0) {
            drawRigSliceSkinnedDeformed(ctx, s, sliceMesh, deformed, eimg, true);
            drewSkinned = true;
          }
        } else if (s.sheetId) {
          const rigImg = rigSheetBitmaps.value.get(s.sheetId);
          if (rigImg && rigImg.complete && rigImg.naturalWidth > 0) {
            drawRigSliceSkinnedDeformed(ctx, s, sliceMesh, deformed, rigImg, false);
            drewSkinned = true;
          }
        }
      }

      if (!drewSkinned) {
        const rigid = rigidSliceWorldPose(s, rig, cx, cy, boneM4);
        if (rigid) {
          ctx.translate(rigid.cx, rigid.cy);
          ctx.rotate(rigid.rot);
          if (s.embedded) {
            const eimg = embeddedRigImages.value.get(s.id);
            if (eimg?.complete && eimg.naturalWidth > 0) {
              ctx.drawImage(eimg, -s.width / 2, -s.height / 2, s.width, s.height);
            }
          } else if (s.sheetId) {
            const rigImg = rigSheetBitmaps.value.get(s.sheetId);
            if (rigImg && rigImg.complete && rigImg.naturalWidth > 0) {
              ctx.drawImage(rigImg, s.x, s.y, s.width, s.height, -s.width / 2, -s.height / 2, s.width, s.height);
            }
          }
        } else {
          const dx = cx - s.width / 2;
          const dy = cy - s.height / 2;
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
        }
      }
      ctx.restore();
    }
    ctx.save();
    for (const s of rig.slices) {
      if (s.width <= 0 || s.height <= 0) continue;
      if (s.id !== selectedCharacterRigSliceId.value) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.save();
      const rigid = rigidSliceWorldPose(s, rig, cx, cy, boneM4);
      if (rigid) {
        ctx.translate(rigid.cx, rigid.cy);
        ctx.rotate(rigid.rot);
        ctx.strokeRect(-s.width / 2 - 1, -s.height / 2 - 1, s.width + 2, s.height + 2);
      } else {
        const dx = cx - s.width / 2;
        const dy = cy - s.height / 2;
        ctx.strokeRect(dx - 1, dy - 1, s.width + 2, s.height + 2);
      }
      ctx.restore();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  if (animatorRigMeshDeformOverlay.value && skinMeshes.length > 0) {
    const overlayMeshes = skinMeshes.filter((m) => {
      if (!m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX)) return true;
      /** Kein doppeltes „blaues Gitter“: Deform-Mesh zeigt dieselbe Geometrie schon texturiert. */
      return !animatorDeformMeshDraw.value;
    });
    if (overlayMeshes.length > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
      ctx.fillStyle = "rgba(56, 189, 248, 0.14)";
      ctx.lineWidth = Math.max(0.75, 1 / viewZoom.value);
      ctx.setLineDash([]);
      for (const mesh of overlayMeshes) {
        const deformed = deformSkinnedMesh(mesh, bindM4, poseM4);
        const idx = mesh.indices;
        for (let ti = 0; ti + 2 < idx.length; ti += 3) {
          const ia = idx[ti]!;
          const ib = idx[ti + 1]!;
          const ic = idx[ti + 2]!;
          const va = deformed[ia];
          const vb = deformed[ib];
          const vc = deformed[ic];
          if (!va || !vb || !vc) continue;
          ctx.beginPath();
          ctx.moveTo(va.x, va.y);
          ctx.lineTo(vb.x, vb.y);
          ctx.lineTo(vc.x, vc.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  const bones = project.value.bones;
  /** 2D „Zylinder“-Schaft: dicke Stroke + runde Kappen. */
  const BONE_SHAFT_W = 7;
  const BONE_SHAFT_W_SEL = 9;
  const boneStroke = "#c9d0df";
  const boneStrokeSel = "#a7b6de";
  const tipHandles: { x: number; y: number }[] = [];
  const selBid = selectedBoneId.value;
  const rigStep = bindPoseViewportEditing.value;

  function drawOneBoneShaft(b: (typeof bones)[0], opts: { selected: boolean }) {
    const Lvis = lengthForBoneVisual(b, selBid, rigStep);
    if (Lvis <= 1e-9) return;
    const M4 = boneM4.get(b.id);
    if (!M4) return;
    const p0 = transformPointMat4(M4, 0, 0, 0);
    const p1 = transformPointMat4(M4, Lvis, 0, 0);
    const joint = { x: p0.x, y: p0.y };
    const tipX = p1.x;
    const tipY = p1.y;
    const ghost = rigStep && b.id === selBid && lengthForBoneDraw(b) < 1e-6;
    if (ghost) {
      g.strokeStyle = "rgba(160, 168, 184, 0.5)";
      g.lineWidth = 2;
      g.lineCap = "butt";
      g.setLineDash([4, 4]);
      g.beginPath();
      g.moveTo(joint.x, joint.y);
      g.lineTo(tipX, tipY);
      g.stroke();
      g.setLineDash([]);
      if (b.id === selBid && rigStep) tipHandles.push({ x: tipX, y: tipY });
      return;
    }
    g.strokeStyle = opts.selected ? boneStrokeSel : boneStroke;
    g.lineWidth = opts.selected ? BONE_SHAFT_W_SEL : BONE_SHAFT_W;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(joint.x, joint.y);
    g.lineTo(tipX, tipY);
    g.stroke();
    if (b.id === selBid && rigStep) {
      tipHandles.push({ x: tipX, y: tipY });
    }
  }

  for (const b of bones) {
    if (b.id === selBid) continue;
    drawOneBoneShaft(b, { selected: false });
  }
  if (selBid) {
    const bs = bones.find((x) => x.id === selBid);
    if (bs) drawOneBoneShaft(bs, { selected: true });
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
  if (pendId && bindPoseViewportEditing.value) {
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
      const deformed = deformSkinnedMesh(m, bindM4, poseM4);
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

  // IK Controls (targets/poles) – editor-only handles.
  const ctls = project.value.rig?.controls?.ikTargets2d ?? [];
  if (ctls.length) {
    const r = 10 / viewZoom.value;
    for (const c2 of ctls) {
      if (!c2.enabled) continue;
      const drag = ikControlDrag.value && ikControlDrag.value.controlId === c2.id ? ikControlDrag.value.preview : null;
      const base = { x: c2.x, y: c2.y, poleX: c2.poleX, poleY: c2.poleY };
      const pose = drag ?? controlPoseNow(c2.id, base);
      const isSel = selectedIkControlId.value === c2.id;
      ctx.save();
      ctx.lineWidth = (isSel ? 3 : 2) / viewZoom.value;
      // line to pole if present
      if (pose.poleX != null && pose.poleY != null) {
        ctx.strokeStyle = "rgba(168, 85, 247, 0.7)";
        ctx.beginPath();
        ctx.moveTo(pose.x, pose.y);
        ctx.lineTo(pose.poleX, pose.poleY);
        ctx.stroke();
        ctx.fillStyle = "rgba(168, 85, 247, 0.25)";
        ctx.strokeStyle = "rgba(168, 85, 247, 0.95)";
        ctx.beginPath();
        ctx.arc(pose.poleX, pose.poleY, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      // target handle
      ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
      ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (isSel) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        ctx.beginPath();
        ctx.arc(pose.x, pose.y, (r + 4 / viewZoom.value), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
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
  const bindM4 = worldBindBoneMatrices4(project.value);
  const poseM4 = solvedPose.value.solvedWorld4ByBoneId;
  const tmp: SkinnedMesh = { ...mesh, influences: st.working };
  const deformed = deformSkinnedMesh(tmp, bindM4, poseM4);
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

  if (e.button === 0) {
    const hitCtl = hitTestIkControl(wx, wy);
    if (hitCtl) {
      const ctl = project.value.rig?.controls?.ikTargets2d?.find((cc) => cc.id === hitCtl.controlId);
      if (ctl) {
        e.preventDefault();
        selectedIkControlId.value = ctl.id;
        const start = controlPoseNow(ctl.id, { x: ctl.x, y: ctl.y, poleX: ctl.poleX, poleY: ctl.poleY });
        ikControlDrag.value = {
          controlId: ctl.id,
          kind: hitCtl.kind,
          pointerId: e.pointerId,
          start,
          preview: { ...start },
        };
        try {
          c.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        draw();
        return;
      }
    }
  }

  if (bindPoseViewportEditing.value && e.button === 0) {
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

  if (e.button === 0 && !characterRigModalOpen.value && !quickRigMode.value) {
    const hitPose = hitTestBoneAnimator(wx, wy);
    if (hitPose) {
      e.preventDefault();
      store.selectBone(hitPose);
      const mode = e.shiftKey ? "translate" : animatorTool.value;
      boneDrag.value = {
        boneId: hitPose,
        animGrab: animatorBoneDragGrab(hitPose, wx, wy),
        mode,
        rotGrab: mode === "rotate" ? beginAnimatorRotateDrag(hitPose, wx, wy) : undefined,
      };
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
      const mode = e.shiftKey ? "translate" : animatorTool.value;
      boneDrag.value = {
        boneId: fromSprite.boneId,
        animGrab: animatorBoneDragGrab(fromSprite.boneId, wx, wy),
        mode,
        rotGrab: mode === "rotate" ? beginAnimatorRotateDrag(fromSprite.boneId, wx, wy) : undefined,
      };
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
  const bindM4 = worldBindBoneMatrices4(project.value);
  const poseM4 = solvedPose.value.solvedWorld4ByBoneId;
  const threshold2 = 20 * 20;
  let bestD2 = threshold2;
  let best: { meshId: string; vi: number } | null = null;
  for (const mesh of meshes) {
    const deformed = deformSkinnedMesh(mesh, bindM4, poseM4);
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
      const tip = boneLengthAndBindRotationFromWorldTip(
        project.value,
        d.boneId,
        wx,
        wy,
        previewBind,
        d.jointWorldFix,
      );
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

  if (ikControlDrag.value) {
    e.preventDefault();
    const { wx, wy } = worldFromClient(e, c);
    const d = ikControlDrag.value;
    if (d.kind === "target") {
      ikControlDrag.value = { ...d, preview: { ...d.preview, x: wx, y: wy } };
    } else {
      ikControlDrag.value = { ...d, preview: { ...d.preview, poleX: wx, poleY: wy } };
    }
    draw();
    return;
  }

  if (boneDrag.value) {
    e.preventDefault();
    const { wx, wy } = worldFromClient(e, c);
    if (bindPoseViewportEditing.value) {
      const local = localBindTranslationForWorldOrigin(project.value, boneDrag.value.boneId, wx, wy);
      if (local) {
        store.dispatch({ type: "setBindPose", boneId: boneDrag.value.boneId, partial: { x: local.x, y: local.y } });
      }
    } else {
      const mode = boneDrag.value.mode ?? animatorTool.value;
      if (mode === "translate") {
        const g = boneDrag.value.animGrab;
        const twx = g ? g.j0x + (wx - g.p0x) : wx;
        const twy = g ? g.j0y + (wy - g.p0y) : wy;
        const boneId = boneDrag.value!.boneId;
        const ikEff = ikEffectorChainForBone(boneId);
        if (ikEff) {
          dispatchIkChainWorldTarget(ikEff.chainId, ikEff.kind, twx, twy);
        } else {
          const bone = project.value.bones.find((b) => b.id === boneId);
          const local = (() => {
            if (!bone) return null;
            if (bone.parentId === null) return { x: twx, y: twy };
            const ps = solvedPose.value;
            const parentW4 = ps.solvedWorld4ByBoneId.get(bone.parentId);
            if (!parentW4) return null;
            const invP = mat4Invert(parentW4);
            if (!invP) return null;
            const p = transformPointMat4(invP, twx, twy, 0);
            return { x: p.x, y: p.y };
          })();
          if (local) {
            store.dispatch({
              type: "setBoneTranslationKeysAtTime",
              boneId,
              t: currentTime.value,
              x: local.x,
              y: local.y,
            });
          }
        }
      } else {
        const grab = boneDrag.value.rotGrab ?? beginAnimatorRotateDrag(boneDrag.value.boneId, wx, wy);
        const a = angleAroundJoint(boneDrag.value.boneId, wx, wy);
        const delta = a - grab.a0;
        const desiredLocalRot = grab.localRot0 + delta;
        const b = project.value.bones.find((x) => x.id === boneDrag.value!.boneId);
        if (b) {
          store.dispatch({
            type: "addKeyframe",
            boneId: b.id,
            property: "rot",
            t: currentTime.value,
            v: desiredLocalRot - b.bindPose.rotation,
          });
        }
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

  if (ikControlDrag.value) {
    const d = ikControlDrag.value;
    ikControlDrag.value = null;
    // Commit base values (not a keyframe yet; keying is a separate action).
    store.dispatch({
      type: "setIkTargetControlBase",
      controlId: d.controlId,
      x: d.preview.x,
      y: d.preview.y,
      poleX: d.preview.poleX,
      poleY: d.preview.poleY,
    });
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
  window.addEventListener("keydown", onAnimatorToolKeyDown, true);
  window.addEventListener("keydown", onIkControlKeyDown, true);
  window.addEventListener("keydown", onViewportWasdKeyDown, true);
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
  window.removeEventListener("keydown", onAnimatorToolKeyDown, true);
  window.removeEventListener("keydown", onIkControlKeyDown, true);
  window.removeEventListener("keydown", onViewportWasdKeyDown, true);
});

function onAnimatorToolKeyDown(e: KeyboardEvent) {
  if (characterRigModalOpen.value || quickRigMode.value) return;
  if (e.key === "g" || e.key === "G") {
    animatorTool.value = "translate";
    draw();
  }
  if (e.key === "r" || e.key === "R") {
    animatorTool.value = "rotate";
    draw();
  }
}

function onIkControlKeyDown(e: KeyboardEvent) {
  if (e.key !== "k" && e.key !== "K") return;
  if (!selectedIkControlId.value) return;
  // Avoid stealing keys while painting or during other drags.
  if (weightBrushEnabled.value) return;
  if (viewDrag.value || boneLengthDrag.value || boneDrag.value || rigSliceDrag.value) return;
  e.preventDefault();
  keySelectedIkControlAtCurrentTime();
  draw();
}

/** Nur 2D-Canvas: WASD wie OrbitControls (2.5D / Setup-WebGL) — vorherige Achsen waren dazu invertiert. */
function onViewportWasdKeyDown(e: KeyboardEvent) {
  if (characterRigModalOpen.value) return;
  if (animatorUsesWebglViewport.value) return;
  if (isTypingInEditableField(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : "";
  if (k !== "w" && k !== "a" && k !== "s" && k !== "d") return;
  e.preventDefault();
  const step = 12;
  if (k === "w") viewPanY.value += step;
  else if (k === "s") viewPanY.value -= step;
  else if (k === "a") viewPanX.value += step;
  else viewPanX.value -= step;
  draw();
}

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
    quickRigMode,
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
watch(animatorRigMeshDeformOverlay, draw);
watch(animatorDeformMeshDraw, draw);

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
    <div v-if="animatorUsesWebglViewport" class="webgl-wrap">
      <AnimatorThreeViewport />
    </div>
    <canvas
      ref="canvas"
      class="cv"
      :class="{ brush: weightBrushEnabled }"
      :style="
        animatorUsesWebglViewport
          ? 'opacity:0; position:absolute; inset:0; pointer-events:none;'
          : undefined
      "
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerup="onCanvasPointerUp"
      @pointercancel="onCanvasPointerCancel"
      @wheel="onWheelView"
      @contextmenu.prevent
    />
    <div v-if="!characterRigModalOpen" class="cam-modes" aria-label="Camera mode">
      <span class="cam-label">Camera</span>
      <button
        type="button"
        class="cam-btn"
        :class="{ active: rigCameraViewKind === '2d' }"
        title="2D (canvas)"
        @click="store.setRigCameraViewKind('2d')"
      >
        2D
      </button>
      <button
        type="button"
        class="cam-btn"
        :class="{ active: rigCameraViewKind === '2.5d' }"
        title="2.5D (WebGL)"
        @click="store.setRigCameraViewKind('2.5d')"
      >
        2.5D
      </button>
      <button
        type="button"
        class="cam-btn"
        :class="{ active: rigCameraViewKind === '3d' }"
        title="3D (WebGL)"
        @click="store.setRigCameraViewKind('3d')"
      >
        3D
      </button>
    </div>
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
.webgl-wrap {
  position: absolute;
  inset: 0;
  z-index: 0;
}
.cv {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: block;
  cursor: crosshair;
  touch-action: none;
  position: relative;
  z-index: 1;
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
.cam-modes {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  color: #cbd5e1;
  z-index: 3;
}
.cam-label {
  font-size: 0.72rem;
  color: #9ca3af;
  margin-right: 4px;
}
.cam-btn {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #374151;
  background: #1f2430;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.72rem;
}
.cam-btn.active {
  border-color: #8b5cf6;
  background: #2a2440;
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
