<script setup lang="ts">
/**
 * Character-Rig: WebGL (Three.js) — Perspektive, Parts mit Z-Extrusion aus sliceDepths.
 */
import {
  addBoneWeightDelta,
  boneIdsInCharacterSubtree,
  boneLengthAndBindRotationFromWorldTip,
  deformSkinnedMesh,
  evaluatePose,
  findCharacterRigBinding,
  findSliceDepthEntry,
  localBindTranslationForWorldOrigin,
  resolveCharacterRigSliceBoundBoneId,
  rigidCharacterRigSliceWorldPose,
  transformPointMat4,
  worldBindBoneMatrices2D,
  worldBindBoneMatrices2DOverridingBindPose,
  worldBindBoneMatrices4,
  worldBindBoneMatrices4OverridingBindPose,
  BONE_LENGTH_HIT_MIN_LOCAL,
  type CharacterRigConfig,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
  type EditorProject,
  type Mat4,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useEditorStore, type RigCameraViewKind } from "../stores/editor.js";
import { boneShaftSegmentsWorld2D, minDistPointToBoneShaftSegmentsSq } from "../boneShaftSegments.js";
import { orbitControlsHandleWasd } from "../viewportWasd.js";

type BrushStroke = {
  meshId: string;
  working: SkinInfluence[][];
  touched: Set<number>;
};

const store = useEditorStore();
const {
  rigEditProject,
  rigCharacterSlots,
  activeCharacterId,
  activeCharacterRig,
  selectedBoneId,
  selectedMeshId,
  selectedCharacterRigSliceId,
  weightBrushEnabled,
  weightBrushRadius,
  weightBrushStrength,
  weightBrushSubtract,
  characterRigModalStep,
  pendingBonePlacementId,
  rigCameraViewKind,
  ikSolveInViewport,
} = storeToRefs(store);

/** Schritt „Binden“: Knochen zuerst treffen; Slices nur auswählen (Zuordnung in der Tabelle) — Knochen trotzdem per Drag/Länge editierbar. */
const rigModalBindStep = computed(() => characterRigModalStep.value === 2);

/** Schritt „3D Settings“: Depth-Vorschau; Shift+Ziehen am Teil = Extrusion; Knochen wie in „Bones“ verschieben/Länge. */
const rigModalDepthStep = computed(() => characterRigModalStep.value === 3);

const containerRef = ref<HTMLDivElement | null>(null);
const raycaster = new THREE.Raycaster();
/**
 * Knochen-Stäbe und Gelenke teilen dieselbe Z-Ebene wie {@link RIG_WORLD_PLANE_Z} (Maus-Raycast).
 * Sonst liegen Gelenke perspektivisch „daneben“: Picking/Längen-Drag passen nicht zur Anzeige.
 */
const RIG_WORLD_PLANE_Z = 40;
const rigWorldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -RIG_WORLD_PLANE_Z);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let perspCamera: THREE.PerspectiveCamera | null = null;
let orthoCamera: THREE.OrthographicCamera | null = null;
let controls: OrbitControls | null = null;
let canvasEl: HTMLCanvasElement | null = null;

const rootGroup = new THREE.Group();
const sliceGroup = new THREE.Group();
const boneLines = new THREE.Group();
const boneJoints = new THREE.Group();
const skinMeshGroup = new THREE.Group();
const refImageGroup = new THREE.Group();

const matLine = new THREE.LineBasicMaterial({ color: 0x6b7280 });
const matLineSel = new THREE.LineBasicMaterial({ color: 0xa5b4fc });
const matJoint = new THREE.MeshBasicMaterial({ color: 0xd4d9e6 });
const matJointSel = new THREE.MeshBasicMaterial({ color: 0xc9d6f5 });
// Bones should stay readable even when zoomed out (world units = pixels).
const matBone = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9, metalness: 0.0 });
const matBoneSel = new THREE.MeshStandardMaterial({ color: 0xa5b4fc, roughness: 0.75, metalness: 0.0 });

// Ensure bones stay visible on top of sprites/meshes.
matBone.depthTest = false;
matBone.depthWrite = false;
matBoneSel.depthTest = false;
matBoneSel.depthWrite = false;
matJoint.depthTest = false;
matJoint.depthWrite = false;
matJointSel.depthTest = false;
matJointSel.depthWrite = false;

const brushStroke = ref<BrushStroke | null>(null);
const rigSliceDrag = ref<{ sliceId: string; grabDx: number; grabDy: number } | null>(null);
const rigSlicePreview = ref<{ id: string; cx: number; cy: number } | null>(null);
const boneDrag = ref<{ boneId: string } | null>(null);
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

/**
 * Längen-Vorschau (Tip/Shift): FK muss dieselbe `length` wie `previewLength` nutzen, sonst weichen
 * Gelenk-Matrizen und Schaft-Geometrie auseinander (stark sichtbar bei Zoom).
 */
const rigProjectForBoneMatrices = computed((): EditorProject => {
  const p = rigEditProject.value;
  const d = boneLengthDrag.value;
  if (!d) return p;
  return {
    ...p,
    bones: p.bones.map((b) =>
      b.id === d.boneId ? { ...b, length: d.previewLength } : b,
    ),
  };
});

/** Live-Extrusion während Shift-Ziehen (ein `setCharacterRigSliceDepth` bei pointerup). */
const depthAdjustDrag = ref<{
  sliceId: string;
  startClientY: number;
  startFront: number;
  startBack: number;
  syncBackWithFront: boolean;
  liveFront: number;
  liveBack: number;
} | null>(null);

const rigModalBoneStep = computed(() => characterRigModalStep.value === 1);
/**
 * Im gesamten Character-Setup-Modal immer Bind-Layout (`worldBindBone*`), nicht `evaluatePose` / IK.
 * War früher nur Schritt 0–1 — ab Bind wurde fälschlich auf gelöste Pose umgeschaltet → Knochen/Sprites
 * wichen von Bones ab.
 */
const rigModalSpritesOrBonesUseBindLayout = computed(() => true);

/**
 * Multi-character: nur den aktiven Slot zeigen/picken (wie ViewportPanel), sonst wirken leere Rigs noch mit
 * fremden Knochen im Setup.
 */
const rigSetupViewportBones = computed(() => {
  const p = rigProjectForBoneMatrices.value;
  const slots = rigCharacterSlots.value;
  if (slots.length <= 1) return p.bones;
  const aid = activeCharacterId.value ?? slots[0]?.id;
  const slot = aid ? slots.find((s) => s.id === aid) : undefined;
  if (!slot) return p.bones;
  const allow = boneIdsInCharacterSubtree(p, slot.rootBoneId);
  return p.bones.filter((b) => allow.has(b.id));
});
const zoomLabel = ref("100%");

let textureCache = new Map<string, THREE.Texture>();
let animId = 0;
let resizeObserver: ResizeObserver | null = null;

type DepthKey = `${string}:${"front" | "back"}`;
const depthDataCache = new Map<DepthKey, { w: number; h: number; data: Uint8ClampedArray }>();
const depthLoadPromises = new Map<DepthKey, Promise<void>>();

/**
 * Bind / rest pose only — never the Animate timeline (`currentTime`).
 * This component lives only inside Character Setup; animation keys must not affect Bind or 3D steps.
 */
const solvedPose = computed(() =>
  evaluatePose(rigEditProject.value, 0, {
    applyIk: ikSolveInViewport.value,
    planar2dNoTiltSpin: rigCameraViewKind.value === "2d",
  }),
);

/**
 * Gleiche Basis wie Pose + Skinning: Bind ohne Tilt/Spin in 2D-Kamera.
 * `skipPlanarChildTipSnap`: sonst zwingt die FK-Korrektur Einzel-Kinder auf (parent.length,0) — Ziehen und Anzeige wichen auseinander.
 */
const planarBindOpts = computed(() =>
  rigCameraViewKind.value === "2d"
    ? ({ planar2dNoTiltSpin: true, skipPlanarChildTipSnap: true } as const)
    : undefined,
);

/** One entry = one line in the overlay (English). */
const viewportHintLines = computed((): string[] => {
  if (rigModalBindStep.value) {
    return [
      "Bind: click part or bone only",
      "No transforms — assign in the table",
    ];
  }
  if (rigModalDepthStep.value) {
    return [
      "3D Settings: selected part only",
      "Depth / maps — panel on the right",
      "Shift+drag — extrusion",
      "Click — pick bone",
      "In front/behind — edit in Bones step",
    ];
  }
  if (weightBrushEnabled.value) {
    return ["Weight brush: selected bone", "Paint — one undo per stroke"];
  }
  if (rigCameraViewKind.value === "2d") {
    return ["2D — orthographic", "WASD — pan · MMB — pan · Wheel — zoom"];
  }
  if (rigCameraViewKind.value === "2.5d") {
    return [
      "2.5D — perspective",
      "WASD — pan · LMB — orbit · MMB — pan · Wheel — zoom",
    ];
  }
  return [
    "3D — full orbit",
    "WASD — pan",
    "Parts with depth — extruded box · Grid — ground",
  ];
});

function activeCamera(): THREE.Camera {
  return rigCameraViewKind.value === "2d" && orthoCamera ? orthoCamera : perspCamera!;
}

function skelioWorldFromClient(clientX: number, clientY: number, el: HTMLElement): { wx: number; wy: number } | null {
  const rect = el.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ndc = new THREE.Vector2(x, y);
  raycaster.setFromCamera(ndc, activeCamera());
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(rigWorldPlane, pt)) return null;
  return { wx: pt.x, wy: -pt.y };
}

function effectiveSliceCenter(s: CharacterRigSpriteSlice): { cx: number; cy: number } {
  const pr = rigSlicePreview.value;
  if (pr && pr.id === s.id) return { cx: pr.cx, cy: pr.cy };
  return { cx: s.worldCx, cy: s.worldCy };
}

function depthForSlice(sliceId: string) {
  const adj = depthAdjustDrag.value;
  if (adj && adj.sliceId === sliceId) {
    return { df: Math.max(0, adj.liveFront), db: Math.max(0, adj.liveBack) };
  }
  const d = findSliceDepthEntry(rigEditProject.value, sliceId);
  const df = Math.max(0, d?.maxDepthFront ?? 0);
  const dbRaw = d?.syncBackWithFront ? df : Math.max(0, d?.maxDepthBack ?? 0);
  const db = d?.syncBackWithFront ? df : dbRaw;
  return { df, db };
}

function depthTextureForSlice(sliceId: string, side: "front" | "back") {
  const d: any = findSliceDepthEntry(rigEditProject.value, sliceId) ?? null;
  if (!d) return null;
  return side === "front" ? d.depthTextureFront ?? null : d.depthTextureBack ?? null;
}

function sampleDepth01(img: { w: number; h: number; data: Uint8ClampedArray }, u: number, v: number): number {
  const x = Math.max(0, Math.min(img.w - 1, Math.floor(u * img.w)));
  const y = Math.max(0, Math.min(img.h - 1, Math.floor(v * img.h)));
  const i = (y * img.w + x) * 4;
  return (img.data[i] ?? 0) / 255;
}

function getDepthImageDataOrStartLoad(sliceId: string, side: "front" | "back"): { w: number; h: number; data: Uint8ClampedArray } | null {
  const tex = depthTextureForSlice(sliceId, side);
  if (!tex?.dataBase64 || !tex?.mimeType) return null;
  const key: DepthKey = `${sliceId}:${side}`;
  const cached = depthDataCache.get(key);
  if (cached && cached.w === tex.pixelWidth && cached.h === tex.pixelHeight) return cached;
  if (depthLoadPromises.has(key)) return null;

  const p = (async () => {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode"));
        img.src = `data:${tex.mimeType};base64,${tex.dataBase64}`;
      });
      const w = Math.max(1, tex.pixelWidth || img.naturalWidth || 1);
      const h = Math.max(1, tex.pixelHeight || img.naturalHeight || 1);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      depthDataCache.set(key, { w, h, data: imgData.data });
    } finally {
      depthLoadPromises.delete(key);
    }
  })();
  depthLoadPromises.set(key, p);
  return null;
}

function applyRigCameraMode(kind: RigCameraViewKind) {
  if (!controls || !perspCamera || !orthoCamera) return;
  const el = containerRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  const aspect = w / Math.max(h, 1);

  if (kind === "2d") {
    orthoCamera.position.set(0, 0, 1800);
    orthoCamera.lookAt(0, 0, 0);
    const halfH = 420;
    const halfW = halfH * aspect;
    orthoCamera.left = -halfW;
    orthoCamera.right = halfW;
    orthoCamera.top = halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.near = 0.1;
    orthoCamera.far = 8000;
    orthoCamera.updateProjectionMatrix();
    controls.object = orthoCamera;
    controls.enableRotate = false;
    /** Sonst bleibt linke Maustaste auf „Rotate“ → interne Deltas + Damping wirken wie wildes Drehen trotz Ortho. */
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.minPolarAngle = Math.PI / 2;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = 0;
    controls.maxAzimuthAngle = 0;
  } else {
    perspCamera.near = 0.5;
    perspCamera.far = 50000;
    perspCamera.fov = 42;
    perspCamera.aspect = aspect;
    perspCamera.updateProjectionMatrix();
    controls.object = perspCamera;
    controls.enableRotate = true;
    if (kind === "2.5d") {
      controls.minPolarAngle = Math.PI * 0.28;
      controls.maxPolarAngle = Math.PI * 0.52;
    } else {
      controls.minPolarAngle = 0.08;
      controls.maxPolarAngle = Math.PI - 0.08;
    }
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    // Ohne Startposition bleibt die Perspektiv-Kamera bei (0,0,0) auf dem Target → nichts sichtbar in 2.5D/3D,
    // bis man „Reset“ drückt. Gleiche Basis wie resetView().
    controls.target.set(0, 0, 0);
    const dist = perspCamera.position.distanceTo(controls.target);
    if (!Number.isFinite(dist) || dist < 80) {
      perspCamera.position.set(420, -180, 620);
    }
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
  }
  controls.update();
  updateZoomLabel();
}

function updateZoomLabel() {
  if (!perspCamera || !orthoCamera || !controls) return;
  if (rigCameraViewKind.value === "2d") {
    zoomLabel.value = `${Math.round(orthoCamera.zoom * 100)}%`;
    return;
  }
  zoomLabel.value = `${Math.round(perspCamera.position.distanceTo(controls.target))}u`;
}

function clearGroup(g: THREE.Group) {
  while (g.children.length) {
    const o = g.children[0]!;
    g.remove(o);
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) {
        m.forEach((mat) => {
          if (mat !== matLine && mat !== matLineSel && mat !== matJoint && mat !== matJointSel) mat.dispose();
        });
      } else if (m !== matLine && m !== matLineSel && m !== matJoint && m !== matJointSel) {
        m.dispose();
      }
    }
  }
}

function lengthForBoneDraw(b: { id: string; length: number }): number {
  const d = boneLengthDrag.value;
  if (d && d.boneId === b.id) return d.previewLength;
  return b.length;
}

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

/**
 * Drawn bone mesh uses fixed world radii (~6–8); short chains (fingers) would look as thick as limbs.
 * Scale thickness by visible length so fine bones stay visually slim when zoomed in.
 */
function rigBoneVisualThicknessScale(Lvis: number): number {
  const ref = 88;
  return Math.min(1.12, Math.max(0.26, Lvis / ref));
}

/**
 * Ortho-Zoom ändert Welt-einheiten pro Pixel: ohne Skalierung sind Treffer bei kleinem Zoom winzig,
 * bei starkem Zoom riesig — und bei Überlappung gewann oft immer derselbe Knochen (nur „Tiefe im Baum“).
 */
function rigBoneHitScaleWorld(): number {
  if (rigCameraViewKind.value !== "2d" || !orthoCamera) return 1;
  const z = Math.max(0.12, orthoCamera.zoom);
  return Math.min(3.2, Math.max(0.55, 1 / z ** 0.42));
}

type RigBonePickCand = {
  boneId: string;
  kind: "joint" | "tip" | "shaft";
  d2: number;
  boneLen: number;
  boneIdx: number;
};

function compareRigBonePickCands(a: RigBonePickCand, b: RigBonePickCand): number {
  const s = rigBoneHitScaleWorld();
  const rJoint = 18 * s;
  const tieEps2 = (rJoint * rJoint) * 0.85;
  if (Math.abs(a.d2 - b.d2) > tieEps2) {
    return a.d2 - b.d2;
  }
  const sel = selectedBoneId.value;
  if (a.boneId === sel && b.boneId !== sel) return -1;
  if (b.boneId === sel && a.boneId !== sel) return 1;
  if (Math.abs(a.boneLen - b.boneLen) > 1e-4) {
    return a.boneLen - b.boneLen;
  }
  return b.boneIdx - a.boneIdx;
}

/**
 * Bones-Schritt: Gelenk (Verschieben) vs. Tip/Schaft (Länge/Winkel).
 * - Parent-Spitze und Kind-Gelenk liegen auf derselben Weltposition: ohne Tiefe gewinnt oft der falsche Knochen.
 * - Nur Tip-Kreis ist zu klein: Klicks auf den sichtbaren Stab (Schaft) starten jetzt auch Längen-Drag.
 */
function resolveRigBoneStepHit(
  wx: number,
  wy: number,
): { type: "length"; boneId: string } | { type: "drag"; boneId: string } | null {
  const po = planarBindOpts.value;
  const pHit = rigProjectForBoneMatrices.value;
  const mats = worldBindBoneMatrices2D(pHit, po);
  const mats4 = worldBindBoneMatrices4(pHit, po);
  const origins = new Map<string, { x: number; y: number }>();
  for (const [id, m] of mats) origins.set(id, { x: m.e, y: m.f });
  const sc = rigBoneHitScaleWorld();
  const rJoint = 18 * sc;
  const rTip = 28 * sc;
  const rShaft = 30 * sc;
  const r2j = rJoint * rJoint;
  const r2t = rTip * rTip;
  const r2s = rShaft * rShaft;
  const sel = selectedBoneId.value;
  /** Schritte 1–3: gleiche Hit-Tests wie „Bones“ (Joint/Tip/Schaft), damit Bind/3D auch editierbar sind. */
  const rigBoneInteractiveHits =
    characterRigModalStep.value >= 1 && characterRigModalStep.value <= 3;

  const cands: RigBonePickCand[] = [];

  rigSetupViewportBones.value.forEach((b, boneIdx) => {
    const o = origins.get(b.id);
    const M = mats.get(b.id);
    const Lhit = Math.max(lengthForBoneDraw(b), BONE_LENGTH_HIT_MIN_LOCAL);
    const t = M ? { x: M.a * Lhit + M.e, y: M.b * Lhit + M.f } : null;
    if (!o || !t) return;
    const meta = { boneLen: b.length, boneIdx };
    const dJ = (o.x - wx) ** 2 + (o.y - wy) ** 2;
    const dT = (t.x - wx) ** 2 + (t.y - wy) ** 2;
    if (dJ <= r2j && dJ <= dT) {
      cands.push({ boneId: b.id, kind: "joint", d2: dJ, ...meta });
      return;
    }
    if (dT <= r2t) {
      cands.push({ boneId: b.id, kind: "tip", d2: dT, ...meta });
      return;
    }
    const Lvis = lengthForBoneVisual(b, sel, rigBoneInteractiveHits);
    if (Lvis > 1e-6 && dJ > r2j) {
      const segs = boneShaftSegmentsWorld2D(b, pHit.bones, mats4, origins, Lvis, {
        lengthPreviewBoneId: boneLengthDrag.value?.boneId ?? null,
      });
      const dSeg = minDistPointToBoneShaftSegmentsSq(wx, wy, segs);
      if (dSeg <= r2s) {
        cands.push({ boneId: b.id, kind: "shaft", d2: dSeg, ...meta });
      }
    }
  });
  if (cands.length === 0) return null;
  cands.sort(compareRigBonePickCands);
  const best = cands[0]!;
  if (best.kind === "joint") return { type: "drag", boneId: best.boneId };
  return { type: "length", boneId: best.boneId };
}

function hitTestBone(wx: number, wy: number, radiusWorld: number): string | null {
  const mats = worldBindBoneMatrices2D(rigProjectForBoneMatrices.value, planarBindOpts.value);
  const origins = new Map<string, { x: number; y: number }>();
  for (const [id, m] of mats) origins.set(id, { x: m.e, y: m.f });
  const sc = rigBoneHitScaleWorld();
  const r = radiusWorld * sc;
  const r2 = r * r;
  const sel = selectedBoneId.value;
  const bones = rigSetupViewportBones.value;
  const hits: { id: string; d2: number; len: number; idx: number }[] = [];
  bones.forEach((b, idx) => {
    const o = origins.get(b.id);
    if (!o) return;
    const d = (o.x - wx) ** 2 + (o.y - wy) ** 2;
    if (d <= r2) hits.push({ id: b.id, d2: d, len: b.length, idx });
  });
  hits.sort((a, b) => {
    if (a.d2 !== b.d2) return a.d2 - b.d2;
    if (a.id === sel && b.id !== sel) return -1;
    if (b.id === sel && a.id !== sel) return 1;
    if (Math.abs(a.len - b.len) > 1e-4) return a.len - b.len;
    return b.idx - a.idx;
  });
  return hits[0]?.id ?? null;
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
  const slices = activeCharacterRig.value?.slices;
  if (!slices?.length) return null;
  const po = planarBindOpts.value;
  const boneM4 = rigModalSpritesOrBonesUseBindLayout.value
    ? worldBindBoneMatrices4(rigEditProject.value, po)
    : solvedPose.value.solvedWorld4ByBoneId;
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.width <= 0 || s.height <= 0) continue;
    const { cx, cy } = effectiveSliceCenter(s);
    const bid = rigModalBindStep.value ? null : resolveCharacterRigSliceBoundBoneId(rigEditProject.value, s.id);
    const binding = bid ? findCharacterRigBinding(rigEditProject.value, s.id) ?? null : null;
    const layoutDrivenBindWizard = !!(bid && rigModalSpritesOrBonesUseBindLayout.value);
    const rigid = bid
      ? rigidCharacterRigSliceWorldPose(
          rigEditProject.value,
          bid,
          cx,
          cy,
          boneM4,
          layoutDrivenBindWizard
            ? { bindBoneOpts: po }
            : {
                localX: binding?.localX,
                localY: binding?.localY,
                localZ: binding?.localZ,
                rotOffset: binding?.rotOffset,
                bindBoneOpts: po,
              },
        )
      : null;
    if (rigid) {
      const tcx = layoutDrivenBindWizard ? cx : rigid.cx;
      const tcy = layoutDrivenBindWizard ? cy : rigid.cy;
      if (pointInRotatedSliceRect(wx, wy, tcx, tcy, s.width, s.height, rigid.rot)) return s.id;
    } else {
      const hw = s.width / 2;
      const hh = s.height / 2;
      if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) return s.id;
    }
  }
  return null;
}

/** Schritt 3: nur das aktuell gewählte Teil ist sichtbar — Hit-Test entsprechend. */
function hitTestRigSliceFor3dSettings(wx: number, wy: number): string | null {
  if (!rigModalDepthStep.value) return hitTestRigSlice(wx, wy);
  const id = selectedCharacterRigSliceId.value;
  if (!id) return null;
  const s = activeCharacterRig.value?.slices?.find((x) => x.id === id);
  if (!s || s.width <= 0 || s.height <= 0) return null;
  const po = planarBindOpts.value;
  const boneM4 = rigModalSpritesOrBonesUseBindLayout.value
    ? worldBindBoneMatrices4(rigEditProject.value, po)
    : solvedPose.value.solvedWorld4ByBoneId;
  const { cx, cy } = effectiveSliceCenter(s);
  const bid = rigModalBindStep.value ? null : resolveCharacterRigSliceBoundBoneId(rigEditProject.value, s.id);
  const binding = bid ? findCharacterRigBinding(rigEditProject.value, s.id) ?? null : null;
  const layoutDrivenBindWizard = !!(bid && rigModalSpritesOrBonesUseBindLayout.value);
  const rigid = bid
    ? rigidCharacterRigSliceWorldPose(
        rigEditProject.value,
        bid,
        cx,
        cy,
        boneM4,
        layoutDrivenBindWizard
          ? { bindBoneOpts: po }
          : {
              localX: binding?.localX,
              localY: binding?.localY,
              localZ: binding?.localZ,
              rotOffset: binding?.rotOffset,
              bindBoneOpts: po,
            },
      )
    : null;
  if (rigid) {
    const tcx = layoutDrivenBindWizard ? cx : rigid.cx;
    const tcy = layoutDrivenBindWizard ? cy : rigid.cy;
    return pointInRotatedSliceRect(wx, wy, tcx, tcy, s.width, s.height, rigid.rot) ? id : null;
  }
  const hw = s.width / 2;
  const hh = s.height / 2;
  return wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh ? id : null;
}

function tryPlacePendingBoneAt(wx: number, wy: number): boolean {
  const id = pendingBonePlacementId.value;
  if (!id) return false;
  const local = localBindTranslationForWorldOrigin(rigEditProject.value, id, wx, wy, planarBindOpts.value);
  if (!local) return false;
  const ok = store.dispatch({ type: "setBindPose", boneId: id, partial: { x: local.x, y: local.y } });
  if (ok) store.setPendingBonePlacement(null);
  return ok;
}

function beginBoneLengthDrag(boneId: string, wx: number, wy: number, e: PointerEvent, el: HTMLElement) {
  store.selectBone(boneId);
  const b = rigEditProject.value.bones.find((x) => x.id === boneId);
  const startLen = b?.length ?? 0;
  const startRot = b?.bindPose.rotation ?? 0;
  const M0 = worldBindBoneMatrices2D(rigEditProject.value, planarBindOpts.value).get(boneId);
  const J0 = M0 ? { x: M0.e, y: M0.f } : undefined;
  const tip = b
    ? boneLengthAndBindRotationFromWorldTip(rigEditProject.value, boneId, wx, wy, undefined, J0)
    : null;
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
    el.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
}

function releaseBoneLengthPointerCapture(pointerId: number, el: HTMLElement | null) {
  if (el?.hasPointerCapture(pointerId)) {
    try {
      el.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }
}

function targetBrushMeshId(): string | null {
  const meshes = rigEditProject.value.skinnedMeshes ?? [];
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
  const mesh = rigEditProject.value.skinnedMeshes?.find((m) => m.id === st.meshId);
  if (!mesh) return;
  const bindM4 = worldBindBoneMatrices4(rigEditProject.value, planarBindOpts.value);
  const poseM4 = solvedPose.value.solvedWorld4ByBoneId;
  const tmp: SkinnedMesh = { ...mesh, influences: st.working };
  const deformed = deformSkinnedMesh(tmp, bindM4, poseM4);
  const r = weightBrushRadius.value;
  const r2 = r * r;
  const str = weightBrushStrength.value * (weightBrushSubtract.value ? -1 : 1);
  const boneIds = new Set(rigEditProject.value.bones.map((b) => b.id));
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

function getOrLoadTexture(key: string, dataUrl: string): THREE.Texture {
  let t = textureCache.get(key);
  if (t) return t;
  const loader = new THREE.TextureLoader();
  t = loader.load(dataUrl, () => {
    // Basis-Sheet lädt asynchron: erst danach sind drawImage/Canvas-Crop und natürliche Maße korrekt.
    if (key.startsWith("sh:")) {
      const sheetId = key.slice(3);
      disposeTextureCachePrefix(`shcanvas:${sheetId}:`);
      disposeTextureCachePrefix(`shcrop:${sheetId}:`);
      rebuildSliceMeshes();
      rebuildReferenceImage();
    }
  });
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  textureCache.set(key, t);
  return t;
}

/** Muss in Cache-Keys — sonst bleibt nach Rect-Änderung ein alter Crop sichtbar. */
function sheetRegionCacheSuffix(s: CharacterRigSpriteSlice): string {
  return `${s.x}:${s.y}:${s.width}:${s.height}`;
}

function disposeTextureCachePrefix(prefix: string) {
  for (const k of [...textureCache.keys()]) {
    if (k.startsWith(prefix)) {
      textureCache.get(k)?.dispose();
      textureCache.delete(k);
    }
  }
}

/**
 * UV und Canvas-Crop müssen dieselbe Pixelbasis wie das decodierte Sheet nutzen (wie Modal / 2D-Viewport).
 * Wenn nur `pixelWidth`/`pixelHeight` in den Daten stehen, aber vom echten Bild abweichen, war der UV-Fallback falsch.
 */
function sheetPixelSize(sh: CharacterRigSpriteSheetEntry, baseTex: THREE.Texture): { w: number; h: number } {
  const img = baseTex.image as HTMLImageElement | undefined;
  const nw = Math.max(0, img?.naturalWidth ?? 0);
  const nh = Math.max(0, img?.naturalHeight ?? 0);
  if (nw > 0 && nh > 0) return { w: nw, h: nh };
  const w =
    sh.pixelWidth && sh.pixelWidth > 0 ? sh.pixelWidth : Math.max(1, img?.naturalWidth ?? img?.width ?? 1);
  const h =
    sh.pixelHeight && sh.pixelHeight > 0 ? sh.pixelHeight : Math.max(1, img?.naturalHeight ?? img?.height ?? 1);
  return { w, h };
}

/** Atlas-UV-Fallback, falls Sheet-Bild noch nicht decodiert (kurz falsch, bis <img> load). */
function makeSheetUvFallbackTexture(
  sh: CharacterRigSpriteSheetEntry,
  s: CharacterRigSpriteSlice,
  baseTex: THREE.Texture,
): THREE.Texture {
  const cropKey = `shcrop:${s.sheetId}:${s.id}:${sheetRegionCacheSuffix(s)}`;
  let cropped = textureCache.get(cropKey);
  if (cropped) return cropped;
  cropped = baseTex.clone();
  cropped.colorSpace = THREE.SRGBColorSpace;
  cropped.flipY = false;
  const { w, h } = sheetPixelSize(sh, baseTex);
  cropped.wrapS = THREE.ClampToEdgeWrapping;
  cropped.wrapT = THREE.ClampToEdgeWrapping;
  cropped.repeat.set(s.width / w, s.height / h);
  cropped.offset.set(s.x / w, 1 - (s.y + s.height) / h);
  cropped.needsUpdate = true;
  textureCache.set(cropKey, cropped);
  return cropped;
}

/**
 * Wie Canvas-2D-Viewport: Rect aus Sheet ausstanzen.
 * CanvasTexture (nicht DataURL + TextureLoader): synchron, flipY wie Three erwartet — sonst oft vertikal gespiegelt
 * (Kopf/Beine vertauscht auf hohen Sheets).
 */
function textureFromSheetCanvasCrop(s: CharacterRigSpriteSlice, baseTex: THREE.Texture): THREE.Texture | undefined {
  const cropKey = `shcanvas:${s.sheetId}:${s.id}:${sheetRegionCacheSuffix(s)}`;
  const cached = textureCache.get(cropKey);
  if (cached) return cached;

  const img = baseTex.image as HTMLImageElement | undefined;
  if (!img || !img.complete || img.naturalWidth <= 0) return undefined;

  try {
    const c = document.createElement("canvas");
    c.width = s.width;
    c.height = s.height;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(img, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    textureCache.set(cropKey, tex);
    return tex;
  } catch {
    return undefined;
  }
}

/** Atlas: Sheet-Rect wie im 2D-Viewport; Canvas-Crop bevorzugt, UV nur als Fallback. */
function getSliceAlbedoTextures(
  s: CharacterRigSpriteSlice,
  rig: CharacterRigConfig,
): { tex?: THREE.Texture; texBack?: THREE.Texture } {
  let tex: THREE.Texture | undefined;
  let texBack: THREE.Texture | undefined;
  if (s.embedded?.dataBase64) {
    tex = getOrLoadTexture(
      `emb:${s.id}:front`,
      `data:${s.embedded.mimeType};base64,${s.embedded.dataBase64}`,
    );
  } else if (s.sheetId) {
    const sh = rig.spriteSheets?.find((x) => x.id === s.sheetId);
    if (sh?.dataBase64) {
      const dataUrl = `data:${sh.mimeType};base64,${sh.dataBase64}`;
      const baseTex = getOrLoadTexture(`sh:${s.sheetId}`, dataUrl);
      tex = textureFromSheetCanvasCrop(s, baseTex) ?? makeSheetUvFallbackTexture(sh, s, baseTex);
    }
  }
  if (s.embeddedBack?.dataBase64) {
    texBack = getOrLoadTexture(
      `emb:${s.id}:back`,
      `data:${s.embeddedBack.mimeType};base64,${s.embeddedBack.dataBase64}`,
    );
  } else if (tex) {
    texBack = tex;
  }
  return { tex, texBack };
}

/** Rail „Side“: im Setup nur die passende Fläche zeigen (Front- vs. Rückseiten-Teil). */
function sliceFacing(s: { side?: "front" | "back" }): "front" | "back" {
  return s.side === "back" ? "back" : "front";
}

function rebuildSliceMeshes() {
  clearGroup(sliceGroup);
  const rig = activeCharacterRig.value;
  if (!rig?.slices?.length) return;

  const poseEval = solvedPose.value;
  const poseM4 = poseEval.solvedWorld4ByBoneId;
  const po = planarBindOpts.value;
  const boneM4 = rigModalSpritesOrBonesUseBindLayout.value
    ? worldBindBoneMatrices4(rigEditProject.value, po)
    : poseM4;
  const activeSliceId = selectedCharacterRigSliceId.value;
  /** Schritt 3: nur das gewählte Teil rendern (keine abgedunkelten anderen). */
  const onlySelectedSlice3d =
    rigModalDepthStep.value && activeSliceId !== null;

  for (const s of rig.slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    if (onlySelectedSlice3d && s.id !== activeSliceId) continue;
    const { cx, cy } = effectiveSliceCenter(s);
    // Bind step should NOT change visual placement: show layout-only (no bound rotation/offset).
    const bid = rigModalBindStep.value ? null : resolveCharacterRigSliceBoundBoneId(rigEditProject.value, s.id);
    const binding = bid ? findCharacterRigBinding(rigEditProject.value, s.id) ?? null : null;
    /**
     * Schritte 0–1: Layout (`worldCx`/`worldCy`) ist maßgeblich. Gespeicherte Binding-Locals + Vorwärtsrechnung
     * weichen sonst minimal ab → sichtbares „Snappen“. Rotation kommt weiter aus invBind·Layout; Position = Layout-Center.
     */
    const layoutDrivenBindWizard = !!(bid && rigModalSpritesOrBonesUseBindLayout.value);
    const rigid = bid
      ? rigidCharacterRigSliceWorldPose(
          rigEditProject.value,
          bid,
          cx,
          cy,
          boneM4,
          layoutDrivenBindWizard
            ? { bindBoneOpts: po }
            : {
                localX: binding?.localX,
                localY: binding?.localY,
                localZ: binding?.localZ,
                rotOffset: binding?.rotOffset,
                bindBoneOpts: po,
              },
        )
      : null;
    const px = layoutDrivenBindWizard ? cx : rigid?.cx ?? cx;
    const py = layoutDrivenBindWizard ? cy : rigid?.cy ?? cy;
    const rot = rigid?.rot ?? 0;
    const { df, db } = depthForSlice(s.id);
    const { tex, texBack } = getSliceAlbedoTextures(s, rig);
    if (!tex) continue;
    const albedoBackTex = texBack ?? tex;
    const depthTotal = df + db;
    const alpha = onlySelectedSlice3d ? 1 : activeSliceId === null ? 1 : s.id === activeSliceId ? 1 : 0.44;
    const facing = sliceFacing(s);

    const mkSliceMat = (map: THREE.Texture) => {
      const m = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        alphaTest: 0.02,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      m.opacity = alpha;
      m.transparent = alpha < 1;
      return m;
    };

    if (depthTotal > 1e-3) {
      // If a depth texture exists, show displaced surfaces (preview only).
      const imgF = getDepthImageDataOrStartLoad(s.id, "front");
      const imgB = getDepthImageDataOrStartLoad(s.id, "back");
      const hasTex = !!imgF || !!imgB || !!depthTextureForSlice(s.id, "front") || !!depthTextureForSlice(s.id, "back");

      if (hasTex) {
        const seg = Math.max(12, Math.min(96, Math.floor(Math.max(s.width, s.height) / 6)));
        let displacedAdded = 0;

        if (facing !== "back" && imgF && df > 1e-6) {
          const geo = new THREE.PlaneGeometry(s.width, s.height, seg, seg);
          const pos = geo.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const u = (x + s.width / 2) / Math.max(1e-9, s.width);
            const v = 1 - (y + s.height / 2) / Math.max(1e-9, s.height);
            pos.setZ(i, sampleDepth01(imgF, u, v) * df);
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, mkSliceMat(tex));
          mesh.position.set(px, -py, 0);
          mesh.rotation.z = -rot;
          mesh.renderOrder = 1;
          sliceGroup.add(mesh);
          displacedAdded++;
        }

        if (facing !== "front" && imgB && db > 1e-6) {
          const geo = new THREE.PlaneGeometry(s.width, s.height, seg, seg);
          const pos = geo.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const u = (x + s.width / 2) / Math.max(1e-9, s.width);
            const v = 1 - (y + s.height / 2) / Math.max(1e-9, s.height);
            // Back is extruded "behind" the sprite.
            pos.setZ(i, -sampleDepth01(imgB, u, v) * db);
          }
          pos.needsUpdate = true;
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, mkSliceMat(albedoBackTex));
          mesh.position.set(px, -py, 0);
          mesh.rotation.z = -rot;
          mesh.renderOrder = 1;
          sliceGroup.add(mesh);
          displacedAdded++;
        }
        if (displacedAdded > 0) continue;
      }

      // Extrusion ohne nutzbare Displacement-Maps, oder nur die andere Seite hat Maps: eine Albedo-Fläche.
      const map = facing === "back" ? albedoBackTex : tex;
      const geo = new THREE.PlaneGeometry(s.width, s.height);
      const mat = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
        roughness: 0.55,
      });
      mat.opacity = alpha;
      mat.transparent = alpha < 1;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, -py, (db - df) / 2);
      mesh.rotation.z = -rot;
      mesh.renderOrder = 1;
      sliceGroup.add(mesh);
    } else {
      const map = facing === "back" ? albedoBackTex : tex;
      const geo = new THREE.PlaneGeometry(s.width, s.height);
      const mat = new THREE.MeshStandardMaterial({
        map,
        transparent: true,
        alphaTest: 0.02,
        side: THREE.DoubleSide,
        roughness: 0.55,
      });
      mat.opacity = alpha;
      mat.transparent = alpha < 1;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, -py, 0);
      mesh.rotation.z = -rot;
      sliceGroup.add(mesh);
    }
  }
}

function rebuildBones() {
  clearGroup(boneLines);
  clearGroup(boneJoints);

  const lenDrag = boneLengthDrag.value;
  const poseEval = solvedPose.value;
  const po = planarBindOpts.value;
  const pMat = rigProjectForBoneMatrices.value;
  const useBindLayout = rigModalSpritesOrBonesUseBindLayout.value;
  let boneM = useBindLayout
    ? worldBindBoneMatrices2D(pMat, po)
    : poseEval.solvedWorld2dByBoneId;
  let boneO: Map<string, { x: number; y: number }>;
  if (useBindLayout) {
    boneO = new Map();
    for (const [id, m] of boneM) boneO.set(id, { x: m.e, y: m.f });
  } else {
    boneO = poseEval.solvedOriginByBoneId;
  }

  const rigBoneInteractive =
    characterRigModalStep.value >= 1 && characterRigModalStep.value <= 3;
  if (rigBoneInteractive && lenDrag) {
    const b = pMat.bones.find((x) => x.id === lenDrag.boneId);
    if (b) {
      boneM = worldBindBoneMatrices2DOverridingBindPose(pMat, lenDrag.boneId, {
        ...b.bindPose,
        rotation: lenDrag.previewRotation,
      }, po);
      boneO = new Map();
      for (const [id, m] of boneM) boneO.set(id, { x: m.e, y: m.f });
    }
  }

  let boneM4: Map<string, Mat4>;
  if (useBindLayout) {
    if (rigBoneInteractive && lenDrag) {
      const b = pMat.bones.find((x) => x.id === lenDrag.boneId);
      if (b) {
        boneM4 = worldBindBoneMatrices4OverridingBindPose(pMat, lenDrag.boneId, {
          ...b.bindPose,
          rotation: lenDrag.previewRotation,
        }, po);
      } else {
        boneM4 = worldBindBoneMatrices4(pMat, po);
      }
    } else {
      boneM4 = worldBindBoneMatrices4(pMat, po);
    }
  } else if (rigBoneInteractive && lenDrag) {
    const b = pMat.bones.find((x) => x.id === lenDrag.boneId);
    if (b) {
      boneM4 = worldBindBoneMatrices4OverridingBindPose(pMat, lenDrag.boneId, {
        ...b.bindPose,
        rotation: lenDrag.previewRotation,
      }, po);
    } else {
      boneM4 = poseEval.solvedWorld4ByBoneId;
    }
  } else {
    boneM4 = poseEval.solvedWorld4ByBoneId;
  }

  const selBid = selectedBoneId.value;

  const bonesList = rigSetupViewportBones.value;
  for (const b of bonesList) {
    const Lvis = lengthForBoneVisual(b, selBid, rigBoneInteractive);
    if (Lvis <= 1e-9) continue;
    const M4 = boneM4.get(b.id);
    if (!M4) continue;
    const segs = boneShaftSegmentsWorld2D(b, bonesList, boneM4, boneO, Lvis, {
      lengthPreviewBoneId: lenDrag?.boneId ?? null,
    });
    const sel = b.id === selBid && rigBoneInteractive;
    const ts = rigBoneVisualThicknessScale(Math.max(Lvis, 1));
    const r = (sel ? 8 : 6) * ts;
    for (const seg of segs) {
      const p0w = transformPointMat4(M4, 0, 0, 0);
      const a = new THREE.Vector3(seg.ax, -seg.ay, p0w.z);
      const c = new THREE.Vector3(seg.bx, -seg.by, p0w.z);
      const dir = c.clone().sub(a);
      const len = dir.length();
      if (len <= 1e-9) continue;
      dir.multiplyScalar(1 / len);
      const mid = a.clone().add(c).multiplyScalar(0.5);
      const geo = new THREE.CylinderGeometry(r, r * 0.96, len, 14, 1, false);
      const mesh = new THREE.Mesh(geo, sel ? matBoneSel : matBone);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      mesh.renderOrder = 3;
      boneLines.add(mesh);
    }
  }

  for (const b of rigSetupViewportBones.value) {
    const M4 = boneM4.get(b.id);
    if (!M4) continue;
    const p0 = transformPointMat4(M4, 0, 0, 0);
    const sel = b.id === selectedBoneId.value;
    const Lvj = lengthForBoneVisual(b, selBid, rigBoneInteractive);
    const ts = rigBoneVisualThicknessScale(Math.max(Lvj, 1));
    const r = (sel ? 8.5 : 6.5) * ts;
    const geo = new THREE.SphereGeometry(r, 16, 12);
    const mesh = new THREE.Mesh(geo, sel ? matJointSel : matJoint);
    mesh.position.set(p0.x, -p0.y, p0.z);
    mesh.renderOrder = 4;
    boneJoints.add(mesh);
  }
}

function rebuildSkinnedMeshPreview() {
  clearGroup(skinMeshGroup);
}

function rebuildReferenceImage() {
  clearGroup(refImageGroup);
  const oldRef = textureCache.get("ref");
  if (oldRef) {
    oldRef.dispose();
    textureCache.delete("ref");
  }
  const ri = rigEditProject.value.referenceImage;
  if (!ri?.dataBase64 || !ri.mimeType) return;
  const tex = getOrLoadTexture("ref", `data:${ri.mimeType};base64,${ri.dataBase64}`);
  const img = new Image();
  img.onload = () => {
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const geo = new THREE.PlaneGeometry(iw, ih);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, -120);
    refImageGroup.add(mesh);
  };
  img.src = `data:${ri.mimeType};base64,${ri.dataBase64}`;
}

function fullRebuild() {
  rebuildSliceMeshes();
  rebuildReferenceImage();
}

function animate() {
  animId = requestAnimationFrame(animate);
  /** Während Bone-/Length-Drag ist `controls.enabled === false`; trotzdem würde `update()` Damping anwenden → Kamera „spinnt“. */
  if (controls?.enabled) controls.update();
  rebuildBones();
  rebuildSkinnedMeshPreview();
  if (renderer && scene) {
    renderer.render(scene, activeCamera());
  }
  updateZoomLabel();
}

function onResize() {
  const el = containerRef.value;
  if (!el || !renderer || !perspCamera || !orthoCamera) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const aspect = w / Math.max(h, 1);
  perspCamera.aspect = aspect;
  perspCamera.updateProjectionMatrix();
  const halfH = 420;
  const halfW = halfH * aspect;
  orthoCamera.left = -halfW;
  orthoCamera.right = halfW;
  orthoCamera.top = halfH;
  orthoCamera.bottom = -halfH;
  orthoCamera.updateProjectionMatrix();
  applyRigCameraMode(rigCameraViewKind.value);
}

function initThree() {
  const el = containerRef.value;
  if (!el) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  perspCamera = new THREE.PerspectiveCamera(42, 1, 0.5, 50000);
  orthoCamera = new THREE.OrthographicCamera(-400, 400, 400, -400, 0.1, 8000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  canvasEl = renderer.domElement;

  const amb = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(200, 400, 600);
  scene.add(dir);

  const grid = new THREE.GridHelper(3600, 72, 0x6b4a9e, 0x2a2540);
  grid.position.y = -620;
  scene.add(grid);

  rootGroup.add(sliceGroup);
  rootGroup.add(boneLines);
  rootGroup.add(boneJoints);
  rootGroup.add(skinMeshGroup);
  rootGroup.add(refImageGroup);
  scene.add(rootGroup);

  controls = new OrbitControls(perspCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };

  applyRigCameraMode(rigCameraViewKind.value);
  fullRebuild();
  animate();

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(el);

  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("pointermove", onPointerMove, true);
  renderer.domElement.addEventListener("pointerup", onPointerUp, true);
  renderer.domElement.addEventListener("pointercancel", onPointerUp, true);
}

function disposeAll() {
  cancelAnimationFrame(animId);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (canvasEl) {
    canvasEl.removeEventListener("pointerdown", onPointerDown, true);
    canvasEl.removeEventListener("pointermove", onPointerMove, true);
    canvasEl.removeEventListener("pointerup", onPointerUp, true);
    canvasEl.removeEventListener("pointercancel", onPointerUp, true);
  }
  controls?.dispose();
  controls = null;
  clearGroup(sliceGroup);
  clearGroup(boneLines);
  clearGroup(boneJoints);
  clearGroup(skinMeshGroup);
  clearGroup(refImageGroup);
  textureCache.forEach((t) => t.dispose());
  textureCache.clear();
  renderer?.dispose();
  if (renderer?.domElement.parentElement) {
    renderer.domElement.parentElement.removeChild(renderer.domElement);
  }
  renderer = null;
  canvasEl = null;
  scene = null;
  perspCamera = null;
  orthoCamera = null;
}

function resetView() {
  if (!controls || !perspCamera || !orthoCamera) return;
  controls.target.set(0, 0, 0);
  if (rigCameraViewKind.value === "2d") {
    orthoCamera.position.set(0, 0, 1800);
    orthoCamera.zoom = 1;
    orthoCamera.updateProjectionMatrix();
  } else {
    perspCamera.position.set(420, -180, 620);
  }
  controls.update();
}

function zoomIn() {
  if (!orthoCamera || !perspCamera || !controls) return;
  if (rigCameraViewKind.value === "2d") {
    orthoCamera.zoom = Math.min(8, orthoCamera.zoom * 1.12);
    orthoCamera.updateProjectionMatrix();
  } else {
    perspCamera.position.sub(controls.target).multiplyScalar(0.88).add(controls.target);
  }
  controls.update();
}

function zoomOut() {
  if (!orthoCamera || !perspCamera || !controls) return;
  if (rigCameraViewKind.value === "2d") {
    orthoCamera.zoom = Math.max(0.15, orthoCamera.zoom / 1.12);
    orthoCamera.updateProjectionMatrix();
  } else {
    perspCamera.position.sub(controls.target).multiplyScalar(1.12).add(controls.target);
  }
  controls.update();
}

function onPointerDown(e: PointerEvent) {
  const el = canvasEl;
  if (!el || !renderer) return;

  if (controls) controls.enabled = true;

  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    return;
  }
  if (e.button === 2) {
    return;
  }

  if (weightBrushEnabled.value && selectedBoneId.value) {
    const mid = targetBrushMeshId();
    if (!mid) return;
    const mesh = rigEditProject.value.skinnedMeshes?.find((m) => m.id === mid);
    if (!mesh) return;
    e.preventDefault();
    e.stopPropagation();
    if (controls) controls.enabled = false;
    brushStroke.value = {
      meshId: mid,
      working: structuredClone(mesh.influences),
      touched: new Set(),
    };
    const w = skelioWorldFromClient(e.clientX, e.clientY, el);
    if (w) applyBrushAt(w.wx, w.wy);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    return;
  }

  const w = skelioWorldFromClient(e.clientX, e.clientY, el);
  if (!w) return;
  const { wx, wy } = w;

  if (rigModalBoneStep.value && e.button === 0) {
    if (pendingBonePlacementId.value) {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      tryPlacePendingBoneAt(wx, wy);
      return;
    }
    if (e.shiftKey) {
      const hitShift = hitTestBone(wx, wy, 18);
      if (hitShift) {
        e.preventDefault();
        e.stopPropagation();
        if (controls) controls.enabled = false;
        beginBoneLengthDrag(hitShift, wx, wy, e, el);
        return;
      }
    }
    const rigHit = resolveRigBoneStepHit(wx, wy);
    if (rigHit?.type === "length") {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      beginBoneLengthDrag(rigHit.boneId, wx, wy, e, el);
      return;
    }
    if (rigHit?.type === "drag") {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      store.selectBone(rigHit.boneId);
      boneDrag.value = { boneId: rigHit.boneId };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    store.selectCharacterRigSlice(null);
    rigSlicePreview.value = null;
    store.clearMeshVertexSelection();
    return;
  }

  /**
   * Bind: nur Auswahl — kein Verschieben von Parts/Knochen im Viewport (Zuordnung nur in der Tabelle).
   * Zuerst Part (liegt oft über dem Skelett), sonst Knochen.
   */
  if (rigModalBindStep.value && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();
    const hitBindSlice = hitTestRigSlice(wx, wy);
    if (hitBindSlice) {
      store.selectCharacterRigSlice(hitBindSlice);
      store.clearMeshVertexSelection();
      return;
    }
    const rigHitBind = resolveRigBoneStepHit(wx, wy);
    if (rigHitBind) {
      store.selectBone(rigHitBind.boneId);
      return;
    }
    const hitJointOnly = hitTestBone(wx, wy, 22);
    if (hitJointOnly) {
      store.selectBone(hitJointOnly);
      return;
    }
    store.selectCharacterRigSlice(null);
    rigSlicePreview.value = null;
    return;
  }

  /** 3D Settings: Teil-Depth mit Shift+Ziehen; Knochen wie in „Bones“ verschieben/Länge. */
  if (rigModalDepthStep.value && e.button === 0) {
    const hitBone = hitTestBone(wx, wy, 22);
    const hitSlice = hitTestRigSliceFor3dSettings(wx, wy);
    const rig = activeCharacterRig.value;
    const bindings = rig?.bindings ?? [];

    if (e.shiftKey && hitSlice) {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      const bidDepth = resolveCharacterRigSliceBoundBoneId(rigEditProject.value, hitSlice);
      if (bidDepth) store.selectBone(bidDepth);
      store.selectCharacterRigSlice(hitSlice);
      store.clearMeshVertexSelection();
      const sd = findSliceDepthEntry(rigEditProject.value, hitSlice);
      const sf = Math.max(0, sd?.maxDepthFront ?? 0);
      const sSync = sd?.syncBackWithFront ?? true;
      const sbRaw = Math.max(0, sd?.maxDepthBack ?? 0);
      const sb = sSync ? sf : sbRaw;
      depthAdjustDrag.value = {
        sliceId: hitSlice,
        startClientY: e.clientY,
        startFront: sf,
        startBack: sb,
        syncBackWithFront: sSync,
        liveFront: sf,
        liveBack: sb,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (e.shiftKey) {
      const hitShiftDepth = hitTestBone(wx, wy, 18);
      if (hitShiftDepth) {
        e.preventDefault();
        e.stopPropagation();
        if (controls) controls.enabled = false;
        beginBoneLengthDrag(hitShiftDepth, wx, wy, e, el);
        return;
      }
    }

    const rigHitDepth = resolveRigBoneStepHit(wx, wy);
    if (rigHitDepth?.type === "length") {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      beginBoneLengthDrag(rigHitDepth.boneId, wx, wy, e, el);
      return;
    }
    if (rigHitDepth?.type === "drag") {
      e.preventDefault();
      e.stopPropagation();
      if (controls) controls.enabled = false;
      const boneId = rigHitDepth.boneId;
      store.selectBone(boneId);
      let sid: string | null = bindings.find((b) => b.boneId === boneId)?.sliceId ?? null;
      if (!sid) {
        for (const sl of rig?.slices ?? []) {
          if (resolveCharacterRigSliceBoundBoneId(rigEditProject.value, sl.id) === boneId) {
            sid = sl.id;
            break;
          }
        }
      }
      store.selectCharacterRigSlice(sid);
      store.clearMeshVertexSelection();
      boneDrag.value = { boneId };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }

    if (hitBone) {
      e.preventDefault();
      e.stopPropagation();
      store.selectBone(hitBone);
      let sid: string | null = bindings.find((b) => b.boneId === hitBone)?.sliceId ?? null;
      if (!sid) {
        for (const sl of rig?.slices ?? []) {
          if (resolveCharacterRigSliceBoundBoneId(rigEditProject.value, sl.id) === hitBone) {
            sid = sl.id;
            break;
          }
        }
      }
      store.selectCharacterRigSlice(sid);
      store.clearMeshVertexSelection();
      return;
    }

    if (hitSlice) {
      e.preventDefault();
      e.stopPropagation();
      const bidSlice = resolveCharacterRigSliceBoundBoneId(rigEditProject.value, hitSlice);
      if (bidSlice) store.selectBone(bidSlice);
      store.selectCharacterRigSlice(hitSlice);
      store.clearMeshVertexSelection();
      return;
    }

    store.selectCharacterRigSlice(null);
    rigSlicePreview.value = null;
    return;
  }

  const hitSlice = hitTestRigSlice(wx, wy);
  if (hitSlice && e.button === 0) {
    e.preventDefault();
    e.stopPropagation();
    if (controls) controls.enabled = false;
    const slices = activeCharacterRig.value?.slices;
    const s = slices?.find((x) => x.id === hitSlice);
    if (!s) return;
    const { cx, cy } = effectiveSliceCenter(s);
    rigSliceDrag.value = { sliceId: hitSlice, grabDx: wx - cx, grabDy: wy - cy };
    rigSlicePreview.value = { id: hitSlice, cx, cy };
    store.selectCharacterRigSlice(hitSlice);
    store.clearMeshVertexSelection();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    return;
  }

  store.selectCharacterRigSlice(null);
  rigSlicePreview.value = null;
}

function onPointerMove(e: PointerEvent) {
  const el = canvasEl;
  if (!el) return;

  if (depthAdjustDrag.value) {
    e.preventDefault();
    e.stopPropagation();
    const d = depthAdjustDrag.value;
    const dy = d.startClientY - e.clientY;
    const sens = 0.085;
    const nf = Math.max(0, d.startFront + dy * sens);
    if (d.syncBackWithFront) {
      depthAdjustDrag.value = { ...d, liveFront: nf, liveBack: nf };
    } else {
      const nb = Math.max(0, d.startBack + dy * sens);
      depthAdjustDrag.value = { ...d, liveFront: nf, liveBack: nb };
    }
    if (renderer) rebuildSliceMeshes();
    return;
  }

  if (boneLengthDrag.value) {
    e.preventDefault();
    e.stopPropagation();
    const w = skelioWorldFromClient(e.clientX, e.clientY, el);
    if (!w) return;
    const d = boneLengthDrag.value;
    const b = rigProjectForBoneMatrices.value.bones.find((x) => x.id === d.boneId);
    if (b) {
      const previewBind = { ...b.bindPose, rotation: d.previewRotation };
      const tip = boneLengthAndBindRotationFromWorldTip(
        rigProjectForBoneMatrices.value,
        d.boneId,
        w.wx,
        w.wy,
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
    return;
  }

  if (boneDrag.value) {
    e.preventDefault();
    e.stopPropagation();
    const w = skelioWorldFromClient(e.clientX, e.clientY, el);
    if (!w) return;
    const local = localBindTranslationForWorldOrigin(
      rigEditProject.value,
      boneDrag.value.boneId,
      w.wx,
      w.wy,
      planarBindOpts.value,
    );
    if (local) {
      store.dispatch({ type: "setBindPose", boneId: boneDrag.value.boneId, partial: { x: local.x, y: local.y } });
    }
    return;
  }

  if (rigSliceDrag.value) {
    e.preventDefault();
    e.stopPropagation();
    const w = skelioWorldFromClient(e.clientX, e.clientY, el);
    if (!w) return;
    const d = rigSliceDrag.value;
    rigSlicePreview.value = {
      id: d.sliceId,
      cx: w.wx - d.grabDx,
      cy: w.wy - d.grabDy,
    };
    if (renderer) rebuildSliceMeshes();
    return;
  }

  if (brushStroke.value) {
    e.preventDefault();
    e.stopPropagation();
    const w = skelioWorldFromClient(e.clientX, e.clientY, el);
    if (w) applyBrushAt(w.wx, w.wy);
  }
}

function onPointerUp(e: PointerEvent) {
  const el = canvasEl;
  if (controls) controls.enabled = true;

  if (depthAdjustDrag.value) {
    const d = depthAdjustDrag.value;
    depthAdjustDrag.value = null;
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    const changed =
      Math.abs(d.liveFront - d.startFront) > 1e-5 ||
      (!d.syncBackWithFront && Math.abs(d.liveBack - d.startBack) > 1e-5);
    if (changed) {
      store.dispatch({
        type: "setCharacterRigSliceDepth",
        sliceId: d.sliceId,
        maxDepthFront: d.liveFront,
        maxDepthBack: d.syncBackWithFront ? d.liveFront : d.liveBack,
        syncBackWithFront: d.syncBackWithFront,
      });
    }
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
    releaseBoneLengthPointerCapture(d.pointerId, el);
    return;
  }

  if (boneDrag.value) {
    boneDrag.value = null;
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
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
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    return;
  }

  if (brushStroke.value) {
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    commitBrushStroke();
  }
}

function onLengthDragEscapeKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (!boneLengthDrag.value) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const d = boneLengthDrag.value;
  boneLengthDrag.value = null;
  releaseBoneLengthPointerCapture(d.pointerId, canvasEl);
}

function onWasdPanKeyDown(e: KeyboardEvent) {
  if (!controls) return;
  if (orbitControlsHandleWasd(controls, e)) e.preventDefault();
}

onMounted(() => {
  window.addEventListener("keydown", onLengthDragEscapeKey, true);
  initThree();
  window.addEventListener("keydown", onWasdPanKeyDown, true);
});

watch(
  () => [activeCharacterRig.value, activeCharacterId.value] as const,
  () => {
    if (renderer) fullRebuild();
  },
  { deep: true },
);

watch(
  () => rigEditProject.value.referenceImage,
  () => {
    if (renderer) rebuildReferenceImage();
  },
  { deep: true },
);

watch([selectedCharacterRigSliceId, rigSlicePreview, depthAdjustDrag, characterRigModalStep], () => {
  if (renderer) rebuildSliceMeshes();
});

watch(rigCameraViewKind, (k) => {
  if (controls) applyRigCameraMode(k);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onLengthDragEscapeKey, true);
  window.removeEventListener("keydown", onWasdPanKeyDown, true);
  disposeAll();
});
</script>

<template>
  <div class="viewport">
    <div
      ref="containerRef"
      class="gl-wrap"
      :class="{ brush: weightBrushEnabled }"
      @contextmenu.prevent
    />
    <div class="view-toolbar" aria-label="Viewport-Ansicht">
      <span class="view-toolbar-label">{{ zoomLabel }}</span>
      <button type="button" class="view-tb-btn" title="Zoom out" @click="zoomOut">−</button>
      <button type="button" class="view-tb-btn" title="Zoom in" @click="zoomIn">+</button>
      <button type="button" class="view-tb-reset view-tb-btn" title="Reset view" @click="resetView">Reset</button>
    </div>
    <div class="hint" role="status">
      <div v-for="(line, i) in viewportHintLines" :key="i" class="hint-line">{{ line }}</div>
    </div>
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
.gl-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  cursor: crosshair;
  touch-action: none;
}
.gl-wrap :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
.gl-wrap.brush {
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
  line-height: 1.45;
  color: #94a3b8;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hint-line {
  display: block;
}
</style>
