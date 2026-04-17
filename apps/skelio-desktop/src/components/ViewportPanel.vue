<!--
  Main 2D canvas: Character Setup (bind/rig wizard) vs Animate (timeline pose) are split here.
  Contract: docs/16-character-setup-animate-boundary.md — never drive Setup from Animate pose.
-->
<script setup lang="ts">
import {
  addBoneWeightDelta,
  allCharacterRigSlices,
  allCharacterRigSpriteSheets,
  boneIdsInCharacterSubtree,
  getCharacterRig,
  boneLengthAndBindRotationFromWorldTip,
  poseBoneRotationTowardWorldPoint,
  deformSkinnedMesh,
  evaluatePose,
  findCharacterRigBinding,
  getFabrikIkChains,
  getTwoBoneIkChains,
  localBindTranslationForWorldOrigin,
  mat4Invert,
  mat4ToMat2dProjection,
  resolveCharacterRigSliceBoundBoneId,
  RIG_SLICE_MESH_ID_PREFIX,
  boundSliceLocalInBindSpace,
  boundSliceWorldAtPose,
  rigidCharacterRigSliceWorldPose,
  rigSliceSkinnedMeshId,
  transformPointMat4,
  worldBindBoneMatrices2D,
  worldBindBoneMatrices4,
  worldBindBoneMatrices4OverridingBindPose,
  BONE_LENGTH_HIT_MIN_LOCAL,
  sampleControlChannel,
  type CharacterRigConfig,
  type CharacterRigSpriteSlice,
  type EditorProject,
  type Mat2D,
  type Mat4,
  type SkinInfluence,
  type SkinnedMesh,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { boneShaftSegmentsWorld2D, minDistPointToBoneShaftSegmentsSq } from "../boneShaftSegments.js";
import { drawRigSliceSkinnedDeformed, drawRigSliceSkinnedDeformedOriginalOnly } from "../drawRigSliceSkinnedMesh.js";
import { drawRigSliceRigidWithSeamFill } from "../drawRigSliceRigidSeamFill.js";
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
  rigEditProject,
  currentTime,
  workspaceMode,
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
  rigCharacterSlots,
  activeCharacterId,
  ikSolveInViewport,
} = storeToRefs(store);

/** Y squash in Character Setup wizard only (pseudo 2.5D / 3D). */
const rigWorldYCompress = computed(() =>
  characterRigModalOpen.value ? rigCameraWorldYScale.value : 1,
);

/**
 * Pose source for this viewport: **Animate** → always committed `project` (no draft).
 * **Rig / Export** → `rigEditProject` (draft while Character Setup is open). Do not merge these concerns.
 * See docs/16-character-setup-animate-boundary.md.
 */
const poseProject = computed(() => {
  const committed = project.value;
  return workspaceMode.value === "animate" ? committed : rigEditProject.value;
});

/**
 * Multi-character: in Rig / Export / Setup / Quick Rig, show only the **active** slot's rig.
 * Animate mode shows the full scene (all characters).
 */
const filterViewportToActiveCharacter = computed(
  () => rigCharacterSlots.value.length > 1 && workspaceMode.value !== "animate",
);

/**
 * Bones to show / pick when {@link filterViewportToActiveCharacter}: active subtree only.
 */
const viewportBones = computed(() => {
  const p = poseProject.value;
  if (!filterViewportToActiveCharacter.value) return p.bones;
  const slots = rigCharacterSlots.value;
  const aid = activeCharacterId.value;
  const slot = aid ? slots.find((s) => s.id === aid) : slots[0];
  if (!slot) return p.bones;
  const allow = boneIdsInCharacterSubtree(p, slot.rootBoneId);
  return p.bones.filter((b) => allow.has(b.id));
});

/** Sprite slices to draw / hit-test (same filter as bones). */
const viewportRigSlices = computed(() => {
  const p = poseProject.value;
  if (!filterViewportToActiveCharacter.value) return allCharacterRigSlices(p);
  const aid = activeCharacterId.value ?? rigCharacterSlots.value[0]?.id;
  const rig = aid ? getCharacterRig(p, aid) : undefined;
  return rig?.slices ?? [];
});

const viewportRigSpriteSheets = computed(() => {
  const p = poseProject.value;
  if (!filterViewportToActiveCharacter.value) return allCharacterRigSpriteSheets(p);
  const aid = activeCharacterId.value ?? rigCharacterSlots.value[0]?.id;
  const rig = aid ? getCharacterRig(p, aid) : undefined;
  return rig?.spriteSheets ?? [];
});

/**
 * Cached solved pose for the current reactive frame (time/project).
 * Keeps `evaluatePose` as SSoT, but avoids multiple recalcs per draw / event handler.
 *
 * While dragging an IK target/pole handle, feed preview coordinates into pose eval so the
 * chain follows the handle live (otherwise the foot stays on the old IK until pointer-up).
 */
const solvedPose = computed(() => {
  const p = poseProject.value;
  /** Character Setup: pose eval must not follow Animate timeline — use bind time only. */
  const t = characterRigModalOpen.value ? 0 : currentTime.value;
  const planar = rigCameraViewKind.value === "2d";
  const drag = ikControlDrag.value;
  /** IK preview off: still solve while dragging an IK handle so the chain follows the pointer. */
  const applyIk = ikSolveInViewport.value || drag != null;
  const opts = { applyIk, planar2dNoTiltSpin: planar } as const;
  if (!drag) return evaluatePose(p, t, opts);
  const rig = p.rig;
  const ctls = rig?.controls?.ikTargets2d;
  if (!rig || !ctls?.length) return evaluatePose(p, t, opts);
  const nextCtls = ctls.map((c) => {
    if (c.id !== drag.controlId) return c;
    const poleOk =
      typeof drag.preview.poleX === "number" &&
      typeof drag.preview.poleY === "number" &&
      Number.isFinite(drag.preview.poleX) &&
      Number.isFinite(drag.preview.poleY);
    return {
      ...c,
      x: drag.preview.x,
      y: drag.preview.y,
      ...(poleOk ? { poleX: drag.preview.poleX, poleY: drag.preview.poleY } : {}),
    };
  });
  const pPatch: EditorProject = {
    ...p,
    rig: {
      ...rig,
      controls: {
        ...(rig.controls ?? {}),
        ikTargets2d: nextCtls,
      },
    },
  };
  return evaluatePose(pPatch, t, opts);
});

/** Gleiche Bind-Basis wie Skinning / Bone-Linien (2D: ohne Tilt/Spin). */
function viewportBindOriginsForHit(): Map<string, { x: number; y: number }> {
  const mats = worldBindBoneMatrices2D(poseProject.value, planarBindOpts.value);
  const o = new Map<string, { x: number; y: number }>();
  for (const [id, m] of mats) o.set(id, { x: m.e, y: m.f });
  return o;
}

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
  /** Rotate drag: joint at pointer-down (fixed) for aiming math. */
  rotGrab?: { jointFix: { x: number; y: number } };
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

/**
 * Character Setup: viewport always bind-pose for the wizard (never the animator timeline pose),
 * regardless of which workspace tab was active before opening.
 */
const rigWizardBindLayoutViewport = computed(() => characterRigModalOpen.value);

/**
 * Wizard-Schritte 0–2 (Sprites / Bones / Bind): Slices immer wie „starre“ Quads zeichnen (rigid),
 * nicht als skinned Mesh — sonst wechselt der Codepfad nach „Generate rig meshes“ und Ebenen/Overlap
 * sehen in Bind anders aus als in Sprites/Bones.
 */
const rigModalRigidSlicesThroughBindStep = computed(
  () => characterRigModalOpen.value && characterRigModalStep.value <= 2,
);

/** Bind-pose interactions on canvas: wizard Bones step or Quick Rig (main window). */
const bindPoseViewportEditing = computed(() => {
  // Animate mode: only animation keys — unless Character Setup Bones step is active.
  if (characterRigModalOpen.value && rigModalBoneStep.value) return true;
  return workspaceMode.value !== "animate" && (rigModalBoneStep.value || quickRigMode.value);
});

/**
 * 2D-Kamera: immer dieselbe planare Basis wie {@link evaluatePose} (skip „Tip-Snap“) —
 * gespeicherte `bindPose.x/y` bleiben maßgeblich in Animate und im Setup.
 */
const planarBindOpts = computed(() => {
  if (rigCameraViewKind.value !== "2d") return undefined;
  return { planar2dNoTiltSpin: true, skipPlanarChildTipSnap: true } as const;
});

const animatorTool = ref<"rotate" | "translate">("rotate");
/** Animate: L toggles UI chip only. Shift+Ctrl+LMB on tip = length (does not require L). */
const animatorLengthMode = ref(false);

/**
 * Shift+LMB / Shift while dragging used to force translate even on the Rotate tool, which wrote
 * tx/ty and looked like “length” or chain drift. Translate is only forced when the translate tool (P) is active.
 * Shift+Ctrl stays reserved for rest-length-on-tip (handled before bone drag).
 */
function animatorShiftMeansTranslate(e: PointerEvent): boolean {
  if (animatorTool.value !== "translate") return false;
  return e.shiftKey && !(e.ctrlKey || e.metaKey);
}

/** Rig sprite slices draggable only in Character Setup wizard step 0, not in day-to-day Animate. */
const mainViewSliceDragEnabled = computed(
  () => characterRigModalOpen.value && characterRigModalStep.value === 0,
);

/**
 * One line = one function: chord or key, action, and (toggle …) when a key selects that mode.
 */
const viewportHintLines = computed((): string[] => {
  if (weightBrushEnabled.value) {
    return ["Weight brush: paint in the viewport", "Uses selected bone", "One undo per stroke"];
  }
  if (!characterRigModalOpen.value) {
    if (quickRigMode.value) {
      if (pendingBonePlacementId.value) {
        return [
          "Click — place new bone (orange ring)",
          "WASD — pan view",
          "Wheel — zoom",
          "Alt+LMB — pan view",
        ];
      }
      return [
        "Drag — move bones (bind pose)",
        "Delete / Backspace — remove bone (not root)",
        "Esc — cancel length preview",
        "WASD — pan view",
        "Wheel — zoom",
        "MMB — pan view",
        "Alt+LMB — pan view",
        "RMB — orbit view (2.5D / 3D)",
      ];
    }
    if (workspaceMode.value === "animate") {
      const cam2d = rigCameraViewKind.value === "2d";
      return [
        cam2d
          ? "Tip: rest length on this canvas — Shift+Ctrl+LMB on bone tip (toggle L: length indicator)"
          : "Tip: rest length — switch to Camera 2D or use Rig / Inspector",
        "Shaft follows local +X × length; if child joint ≠ tip, a short tip→child segment links the chain",
      ];
    }
    return [
      "Wheel — zoom",
      "MMB — pan view",
      "Alt+LMB — pan view",
      ...(rigCameraViewKind.value === "2d" ? [] : ["RMB — orbit view"]),
    ];
  }
  if (characterRigModalOpen.value && rigCameraWorldYScale.value < 0.999) {
    return [
      "Character Setup: camera Y squashed (pseudo depth)",
      "Same pick logic as usual",
      "Wheel — zoom",
    ];
  }
  if (characterRigModalOpen.value && characterRigModalStep.value === 2) {
    return [
      "Bind: WebGL — click part or bone only",
      "No dragging — map in the table",
    ];
  }
  if (rigModalBoneStep.value) {
    if (pendingBonePlacementId.value) {
      return ["Bones: click — place bone (orange ring)", "Wheel — zoom"];
    }
    return [
      "Bones: drag tip — length / bind rotation",
      "Shift+joint — length from joint",
      "Esc — cancel",
      "Delete / Backspace — remove bone (not root)",
      "Wheel — zoom",
      "Alt+LMB — pan",
      "RMB — orbit (2.5D / 3D)",
    ];
  }
  if (viewportRigSlices.value.length > 0) {
    if (!mainViewSliceDragEnabled.value) {
      return [
        "Rig meshes on — drag bones (animated keys)",
        "No free slice drag in this step",
        "Wheel — zoom",
        "Alt+LMB — pan",
        "RMB — orbit",
      ];
    }
    return [
      "Wheel — zoom",
      "MMB — pan",
      "Alt+LMB — pan",
      "RMB — orbit",
      "LMB — drag slices",
    ];
  }
  return [
    "Wheel — zoom",
    "MMB — pan view",
    "Alt+LMB — pan view",
    "RMB — orbit view",
    "Y axis — down",
    "Vertex — weight paint",
  ];
});

const animatorUsesWebglViewport = computed(() => !characterRigModalOpen.value && rigCameraViewKind.value !== "2d");

/** Kurzliste für das Panel links über „Camera“ (nur Lesen; Bedienung unverändert). */
type ShortcutLine = { keys: string[]; label: string };

const shortcutPanelLines = computed((): ShortcutLine[] => {
  if (characterRigModalOpen.value) return [];
  if (quickRigMode.value) {
    const lines: ShortcutLine[] = [
      { keys: ["Esc"], label: "Cancel length preview" },
      { keys: ["Del"], label: "Remove bone (not root)" },
    ];
    if (pendingBonePlacementId.value) {
      lines.unshift({ keys: ["Click"], label: "Place new bone" });
    }
    lines.push(
      { keys: ["W", "A", "S", "D"], label: "Pan view" },
      {
        keys:
          rigCameraViewKind.value === "2d"
            ? ["Wheel", "MMB", "Alt+LMB"]
            : ["Wheel", "MMB", "Alt+LMB", "RMB"],
        label: rigCameraViewKind.value === "2d" ? "Zoom · pan" : "Zoom · pan · orbit",
      },
    );
    return lines;
  }
  if (workspaceMode.value === "animate") {
    const lines: ShortcutLine[] = [
      { keys: ["P"], label: "Translate tool (LMB moves tx/ty)" },
      { keys: ["R"], label: "Rotate tool (LMB rotates only — rest length unchanged)" },
      { keys: ["Shift+LMB"], label: "Move position (only when P / translate tool is active)" },
      { keys: ["Shift+Ctrl+LMB"], label: "Rest bone length on tip (toggle L: length indicator)" },
      { keys: ["Alt+LMB"], label: "Pan view" },
      { keys: ["W", "A", "S", "D"], label: "Pan view" },
      { keys: ["K"], label: "Keyframe IK handle at playhead" },
      { keys: ["Wheel"], label: "Zoom" },
      { keys: ["MMB"], label: "Pan view" },
    ];
    if (rigCameraViewKind.value !== "2d") {
      lines.push({ keys: ["RMB"], label: "Orbit view" });
    }
    lines.push({
      keys: [],
      label: "Tilt / spin: Inspector → bone 3D",
    });
    return lines;
  }
  return [
    {
      keys: [],
      label: "Animate mode: shortcuts in viewport when toolbar is Animate.",
    },
  ];
});

function hitTestBoneTip(wx: number, wy: number, radiusWorld: number): string | null {
  const mats = worldBindBoneMatrices2D(poseProject.value, planarBindOpts.value);
  const sc = viewportBonePickScale();
  const r = radiusWorld * sc;
  const r2 = r * r;
  const tieEps2 = (28 * sc) ** 2 * 0.85;
  const sel = selectedBoneId.value;
  const bones = viewportBones.value;
  const hits: { id: string; d2: number; len: number; idx: number }[] = [];
  bones.forEach((b, idx) => {
    const M = mats.get(b.id);
    if (!M) return;
    const L = Math.max(b.length, BONE_LENGTH_HIT_MIN_LOCAL);
    const t = { x: M.a * L + M.e, y: M.b * L + M.f };
    const d = (t.x - wx) ** 2 + (t.y - wy) ** 2;
    if (d <= r2) hits.push({ id: b.id, d2: d, len: b.length, idx });
  });
  hits.sort((a, b) => {
    if (Math.abs(a.d2 - b.d2) > tieEps2) {
      return a.d2 - b.d2;
    }
    if (a.id === sel && b.id !== sel) return -1;
    if (b.id === sel && a.id !== sel) return 1;
    if (Math.abs(a.len - b.len) > 1e-4) return a.len - b.len;
    return b.idx - a.idx;
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
  const b = poseProject.value.bones.find((x) => x.id === boneId);
  const startLen = b?.length ?? 0;
  const startRot = b?.bindPose.rotation ?? 0;
  const J0 = viewportBindOriginsForHit().get(boneId);
  const tip = b ? boneLengthAndBindRotationFromWorldTip(poseProject.value, boneId, wx, wy, undefined, J0) : null;
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
  const origins = viewportBindOriginsForHit();
  const sc = viewportBonePickScale();
  const r = radiusWorld * sc;
  const r2 = r * r;
  const sel = selectedBoneId.value;
  const bones = viewportBones.value;
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

/**
 * Main editor (animator): pick by joint **or** by distance to the posed bone segment (joint → tip).
 * Joints alone are tiny under full sprites; segment picking matches what you see as the grey bone line.
 */
function hitTestBoneAnimator(wx: number, wy: number): string | null {
  const { boneM4: mats4, boneO: origins } = viewportBoneBindPoseAndDrawState();
  const sc = viewportBonePickScale();
  const jointR = 48 * sc;
  const segR = 40 * sc;
  const jointR2 = jointR * jointR;
  const segMaxD2 = segR * segR;
  const rigStep = bindPoseViewportEditing.value;
  const sel = selectedBoneId.value;
  const bones = viewportBones.value;
  const cands: { id: string; score: number; len: number; idx: number }[] = [];
  bones.forEach((b, idx) => {
    const joint = origins.get(b.id);
    const M4 = mats4.get(b.id);
    if (!joint || !M4) return;
    const dJoint = (wx - joint.x) ** 2 + (wy - joint.y) ** 2;
    let dSeg = Infinity;
    const Lvis = lengthForBoneVisual(b, sel, rigStep);
    if (Lvis > 1e-6) {
      const segs = boneShaftSegmentsWorld2D(b, bones, mats4, origins, Lvis, {
        lengthPreviewBoneId: boneLengthDrag.value?.boneId ?? null,
      });
      dSeg = minDistPointToBoneShaftSegmentsSq(wx, wy, segs);
    }
    const jointHit = dJoint <= jointR2;
    const segHit = Lvis > 1e-6 && dSeg <= segMaxD2;
    if (!jointHit && !segHit) return;
    const score = Math.min(dJoint, dSeg);
    cands.push({ id: b.id, score, len: b.length, idx });
  });
  cands.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.id === sel && b.id !== sel) return -1;
    if (b.id === sel && a.id !== sel) return 1;
    if (Math.abs(a.len - b.len) > 1e-4) return a.len - b.len;
    return b.idx - a.idx;
  });
  return cands[0]?.id ?? null;
}

function tryPlacePendingBoneAt(wx: number, wy: number): boolean {
  const id = pendingBonePlacementId.value;
  if (!id) return false;
  const local = localBindTranslationForWorldOrigin(poseProject.value, id, wx, wy);
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

/** Gleiche Idee wie CharacterRigThreeViewport: Zoom macht Welt-pro-Pixel kleiner/groß — Radien mitziehen. */
function viewportBonePickScale(): number {
  const z = Math.max(0.12, viewZoom.value);
  return Math.min(3.2, Math.max(0.55, 1 / z ** 0.42));
}

const zoomPercent = computed(() => Math.round(viewZoom.value * 100));

function resetViewportView() {
  viewPanX.value = 0;
  viewPanY.value = 0;
  viewZoom.value = 1;
  viewRotation.value = 0;
  draw();
}

watch(
  rigCameraViewKind,
  (k) => {
    // 2D canvas must never appear "tilted" by view rotation.
    if (k === "2d" && Math.abs(viewRotation.value) > 1e-9) {
      viewRotation.value = 0;
      draw();
    }
  },
  { immediate: true },
);

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
  () => poseProject.value.referenceImage,
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
  () => viewportRigSpriteSheets.value,
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
  () => viewportRigSlices.value,
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

function mat4FromMat2d(m: Mat2D): Mat4 {
  const o = new Float64Array(16);
  o[0] = m.a;
  o[1] = m.b;
  o[4] = m.c;
  o[5] = m.d;
  o[10] = 1;
  o[15] = 1;
  o[12] = m.e;
  o[13] = m.f;
  return o;
}

function mat2dRotationOnly(m: Mat2D): Mat2D {
  // Strip scale/shear so Deform-Mesh matches rigid sprites (rotation + translation only).
  const ang = Math.atan2(m.b, m.a);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { a: c, b: s, c: -s, d: c, e: m.e, f: m.f };
}

function mat2dMapToMat4RotationOnly(m2: Map<string, Mat2D>): Map<string, Mat4> {
  const o = new Map<string, Mat4>();
  for (const [id, m] of m2) o.set(id, mat4FromMat2d(mat2dRotationOnly(m)));
  return o;
}

/** Bind + Pose matrices for main viewport (slices + bones + mesh preview). */
function viewportBoneBindPoseAndDrawState(): {
  bindM4: Map<string, Mat4>;
  poseM4: Map<string, Mat4>;
  /** Pose side of skinning: equals bind while rig wizard / bind-pose edit so layout does not jump. */
  poseM4Draw: Map<string, Mat4>;
  boneM4: Map<string, Mat4>;
  boneM: Map<string, Mat2D>;
  boneO: Map<string, { x: number; y: number }>;
} {
  const po = planarBindOpts.value;
  let bindM4 = worldBindBoneMatrices4(poseProject.value, po);
  const poseEval = solvedPose.value;
  let poseM4 = poseEval.solvedWorld4ByBoneId;
  // Hard guarantee: 2D animator skinning uses strictly planar 2D matrices (no 3D components).
  if (rigCameraViewKind.value === "2d") {
    // Additionally strip scale/shear so Deform-Mesh behaves like rigid sprites (rotation-only).
    bindM4 = mat2dMapToMat4RotationOnly(worldBindBoneMatrices2D(poseProject.value, po));
    poseM4 = mat2dMapToMat4RotationOnly(poseEval.solvedWorld2dByBoneId);
  }
  const useBindBoneDraw =
    bindPoseViewportEditing.value || rigWizardBindLayoutViewport.value;
  const poseM4Draw = useBindBoneDraw ? bindM4 : poseM4;
  const lenDrag = boneLengthDrag.value;
  /** Same `poseM4` as {@link poseM4Draw} in Animate so bone lines match skinned mesh (full FK W4 would drift vs rotation-only deform). */
  let boneM4 = useBindBoneDraw ? bindM4 : poseM4;
  let boneO: Map<string, { x: number; y: number }>;
  if (useBindBoneDraw) {
    boneO = new Map();
    for (const [id, m] of bindM4) boneO.set(id, { x: m[12], y: m[13] });
  } else if (rigCameraViewKind.value === "2d") {
    boneO = new Map();
    for (const [id, m] of boneM4) boneO.set(id, { x: m[12], y: m[13] });
  } else {
    boneO = poseEval.solvedOriginByBoneId;
  }
  if (bindPoseViewportEditing.value && lenDrag) {
    const b = poseProject.value.bones.find((x) => x.id === lenDrag.boneId);
    if (b) {
      boneM4 = worldBindBoneMatrices4OverridingBindPose(poseProject.value, lenDrag.boneId, {
        ...b.bindPose,
        rotation: lenDrag.previewRotation,
      }, po);
      boneO = new Map();
      for (const [id, m] of boneM4) boneO.set(id, { x: m[12], y: m[13] });
    }
  }
  const boneM = mat4MapToMat2d(boneM4);
  return { bindM4, poseM4, poseM4Draw, boneM4, boneM, boneO };
}

function rigidSliceWorldPose(
  s: CharacterRigSpriteSlice,
  _rig: CharacterRigConfig,
  layoutCx: number,
  layoutCy: number,
  boneM4: Map<string, Mat4>,
): { cx: number; cy: number; rot: number } | null {
  const bid = resolveCharacterRigSliceBoundBoneId(poseProject.value, s.id);
  if (!bid) return null;
  const binding = findCharacterRigBinding(poseProject.value, s.id) ?? null;
  /** Character Setup: layout world leads — else pose drifts vs stored binding locals. */
  const layoutOnlyRig = characterRigModalOpen.value && bid;

  // Hard guarantee: 2D animator rigid slices use 2D bind/pose matrices only.
  if (rigCameraViewKind.value === "2d") {
    const po2d = planarBindOpts.value ?? { planar2dNoTiltSpin: true as const, skipPlanarChildTipSnap: true as const };
    const B2 = worldBindBoneMatrices2D(poseProject.value, po2d).get(bid);
    const P2raw = solvedPose.value.solvedWorld2dByBoneId.get(bid);
    if (!B2 || !P2raw) return null;
    const P2 =
      characterRigModalOpen.value && workspaceMode.value !== "animate" ? B2 : P2raw;
    const loc = boundSliceLocalInBindSpace(B2, layoutCx, layoutCy);
    if (!loc) return null;
    const wp = boundSliceWorldAtPose(P2, loc.lx, loc.ly);
    const rotBind = Math.atan2(B2.b, B2.a);
    return { cx: wp.x, cy: wp.y, rot: wp.rotationRad - rotBind };
  }

  const po = planarBindOpts.value;
  return rigidCharacterRigSliceWorldPose(
    poseProject.value,
    bid,
    layoutCx,
    layoutCy,
    boneM4,
    layoutOnlyRig
      ? { bindBoneOpts: po }
      : {
          localX: binding?.localX,
          localY: binding?.localY,
          localZ: binding?.localZ,
          rotOffset: binding?.rotOffset,
          bindBoneOpts: po,
        },
  );
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
  const slices = viewportRigSlices.value;
  if (!slices.length) return null;
  const { boneM4 } = viewportBoneBindPoseAndDrawState();
  for (let i = slices.length - 1; i >= 0; i--) {
    const s = slices[i]!;
    if (s.width <= 0 || s.height <= 0) continue;
    const { cx, cy } = effectiveSliceCenter(s);
    const bidHit = resolveCharacterRigSliceBoundBoneId(poseProject.value, s.id);
    const layoutHit = characterRigModalOpen.value && bidHit;
    const rigid = rigidSliceWorldPose(s, {} as CharacterRigConfig, cx, cy, boneM4);
    if (rigid) {
      const tcx = layoutHit ? cx : rigid.cx;
      const tcy = layoutHit ? cy : rigid.cy;
      if (pointInRotatedSliceRect(wx, wy, tcx, tcy, s.width, s.height, rigid.rot)) return s.id;
    } else {
      const hw = s.width / 2;
      const hh = s.height / 2;
      if (wx >= cx - hw && wx <= cx + hw && wy >= cy - hh && wy <= cy + hh) return s.id;
    }
  }
  return null;
}

function bindingBoneIdForSlice(sliceId: string): string | null {
  return resolveCharacterRigSliceBoundBoneId(poseProject.value, sliceId);
}

/**
 * If `boneId` is the IK-driven tip of an enabled chain, dragging translation must move the
 * chain target — not tx/ty on the bone (those fight the solver and detach sprites).
 */
function ikEffectorChainForBone(
  boneId: string,
): { kind: "two" | "fabrik"; chainId: string } | null {
  const p = poseProject.value;
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
  const ctl = poseProject.value.rig?.controls?.ikTargets2d?.find((c) => c.chainId === chainId);
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
  const j = viewportBoneBindPoseAndDrawState().boneO.get(boneId);
  if (!j) return { j0x: pwx, j0y: pwy, p0x: pwx, p0y: pwy };
  return { j0x: j.x, j0y: j.y, p0x: pwx, p0y: pwy };
}

function beginAnimatorRotateDrag(boneId: string): { jointFix: { x: number; y: number } } {
  const j = viewportBoneBindPoseAndDrawState().boneO.get(boneId);
  return { jointFix: j ? { x: j.x, y: j.y } : { x: 0, y: 0 } };
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
  return poseProject.value.clips.find((c) => c.id === poseProject.value.activeClipId);
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
  const ctls = poseProject.value.rig?.controls?.ikTargets2d ?? [];
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
  const ctl = poseProject.value.rig?.controls?.ikTargets2d?.find((c) => c.id === id);
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

  const skinMeshes = poseProject.value.skinnedMeshes ?? [];
  const { bindM4, poseM4Draw, boneM4, boneO } = viewportBoneBindPoseAndDrawState();

  const rigSlices = viewportRigSlices.value;
  if (rigSlices.length) {
    const activeSliceId = selectedCharacterRigSliceId.value;
    for (const s of rigSlices) {
      if (s.width <= 0 || s.height <= 0) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      const isActive = activeSliceId !== null && s.id === activeSliceId;
      const alpha = activeSliceId === null ? 1 : isActive ? 1 : 0.44;
      ctx.save();
      ctx.globalAlpha = alpha;

      const sliceMesh =
        animatorDeformMeshDraw.value &&
        bindingBoneIdForSlice(s.id) &&
        !rigModalRigidSlicesThroughBindStep.value
          ? skinMeshes.find((m) => m.id === rigSliceSkinnedMeshId(s.id))
          : undefined;
      let drewSkinned = false;
      if (sliceMesh) {
        const deformed = deformSkinnedMesh(sliceMesh, bindM4, poseM4Draw);
        if (s.embedded) {
          const eimg = embeddedRigImages.value.get(s.id);
          if (eimg?.complete && eimg.naturalWidth > 0) {
            // 1) Gap-Fill (erweiterte Mesh-Bereiche) - Hintergrund
            drawRigSliceSkinnedDeformed(ctx, s, sliceMesh, deformed, eimg, true);
            // 2) Original (nur innere Dreiecke) - Vordergrund, überdeckt Gap-Fill
            drawRigSliceSkinnedDeformedOriginalOnly(ctx, s, sliceMesh, deformed, eimg, true);
            drewSkinned = true;
          }
        } else if (s.sheetId) {
          const rigImg = rigSheetBitmaps.value.get(s.sheetId);
          if (rigImg && rigImg.complete && rigImg.naturalWidth > 0) {
            drawRigSliceSkinnedDeformed(ctx, s, sliceMesh, deformed, rigImg, false);
            drawRigSliceSkinnedDeformedOriginalOnly(ctx, s, sliceMesh, deformed, rigImg, false);
            drewSkinned = true;
          }
        }
      }

      if (!drewSkinned) {
        const rigid = rigidSliceWorldPose(s, {} as CharacterRigConfig, cx, cy, boneM4);
        if (rigid) {
          ctx.translate(rigid.cx, rigid.cy);
          ctx.rotate(rigid.rot);
          if (s.embedded) {
            const eimg = embeddedRigImages.value.get(s.id);
            if (eimg?.complete && eimg.naturalWidth > 0) {
              // Gap-Fill zuerst
              drawRigSliceRigidWithSeamFill(ctx, s, eimg, true);
              // Original darüber (exakte Größe)
              ctx.drawImage(eimg, -s.width / 2, -s.height / 2, s.width, s.height);
            }
          } else if (s.sheetId) {
            const rigImg = rigSheetBitmaps.value.get(s.sheetId);
            if (rigImg && rigImg.complete && rigImg.naturalWidth > 0) {
              drawRigSliceRigidWithSeamFill(ctx, s, rigImg, false);
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
    for (const s of rigSlices) {
      if (s.width <= 0 || s.height <= 0) continue;
      if (s.id !== selectedCharacterRigSliceId.value) continue;
      const { cx, cy } = effectiveSliceCenter(s);
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.save();
      const rigid = rigidSliceWorldPose(s, {} as CharacterRigConfig, cx, cy, boneM4);
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
    const sliceIdsForOverlay = new Set(viewportRigSlices.value.map((s) => s.id));
    const overlayMeshes = skinMeshes.filter((m) => {
      if (m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX)) {
        if (
          filterViewportToActiveCharacter.value &&
          !sliceIdsForOverlay.has(m.id.slice(RIG_SLICE_MESH_ID_PREFIX.length))
        ) {
          return false;
        }
        /** Kein doppeltes „blaues Gitter“: Deform-Mesh zeigt dieselbe Geometrie schon texturiert. */
        return !animatorDeformMeshDraw.value;
      }
      if (filterViewportToActiveCharacter.value) return false;
      return true;
    });
    if (overlayMeshes.length > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
      ctx.fillStyle = "rgba(56, 189, 248, 0.14)";
      ctx.lineWidth = Math.max(0.75, 1 / viewZoom.value);
      ctx.setLineDash([]);
      for (const mesh of overlayMeshes) {
        const deformed = deformSkinnedMesh(mesh, bindM4, poseM4Draw);
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

  const bones = viewportBones.value;
  /** 2D „Zylinder“-Schaft: dicke Stroke + runde Kappen. */
  const BONE_SHAFT_W = 7;
  const BONE_SHAFT_W_SEL = 9;
  const boneStroke = "#c9d0df";
  const boneStrokeSel = "#a7b6de";
  const tipHandles: { x: number; y: number }[] = [];
  const selBid = selectedBoneId.value;
  const rigStep = bindPoseViewportEditing.value || rigModalRigidSlicesThroughBindStep.value;

  function drawOneBoneShaft(b: (typeof bones)[0], opts: { selected: boolean }) {
    const Lvis = lengthForBoneVisual(b, selBid, rigStep);
    if (Lvis <= 1e-9) return;
    const M4 = boneM4.get(b.id);
    if (!M4) return;
    const p0 = transformPointMat4(M4, 0, 0, 0);
    const tipGeom = transformPointMat4(M4, Lvis, 0, 0);
    const tipX = tipGeom.x;
    const tipY = tipGeom.y;
    const joint = { x: p0.x, y: p0.y };
    const segs = boneShaftSegmentsWorld2D(b, bones, boneM4, boneO, Lvis, {
      lengthPreviewBoneId: boneLengthDrag.value?.boneId ?? null,
    });
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
    for (const s of segs) {
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
    }
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
    const o = viewportBindOriginsForHit().get(pendId);
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
      const deformed = deformSkinnedMesh(m, bindM4, poseM4Draw);
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
  const ctls = poseProject.value.rig?.controls?.ikTargets2d ?? [];
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
  const meshes = poseProject.value.skinnedMeshes ?? [];
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
  const mesh = poseProject.value.skinnedMeshes?.find((m) => m.id === st.meshId);
  if (!mesh) return;
  const { bindM4, poseM4Draw } = viewportBoneBindPoseAndDrawState();
  const tmp: SkinnedMesh = { ...mesh, influences: st.working };
  const deformed = deformSkinnedMesh(tmp, bindM4, poseM4Draw);
  const r = weightBrushRadius.value;
  const r2 = r * r;
  const str = weightBrushStrength.value * (weightBrushSubtract.value ? -1 : 1);
  const boneIds = new Set(poseProject.value.bones.map((b) => b.id));
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
    // In 2D canvas we do not allow view rotation (prevents "tilt" perception).
    if (rigCameraViewKind.value !== "2d") {
      viewDrag.value = { kind: "rotate", lastX: e.clientX, lastY: e.clientY };
    }
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
    const mesh = poseProject.value.skinnedMeshes?.find((m) => m.id === mid);
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

  // Animate: Shift+Ctrl+LMB on bone tip — rest length (chord is unambiguous; no L required).
  if (
    e.button === 0 &&
    !characterRigModalOpen.value &&
    !quickRigMode.value &&
    workspaceMode.value === "animate" &&
    e.shiftKey &&
    (e.ctrlKey || e.metaKey) &&
    !e.altKey
  ) {
    const hitTip = hitTestBoneTip(wx, wy, 22);
    if (hitTip) {
      e.preventDefault();
      beginBoneLengthDrag(hitTip, wx, wy, e, c);
      draw();
      return;
    }
  }

  if (e.button === 0) {
    const hitCtl = hitTestIkControl(wx, wy);
    if (hitCtl) {
      const ctl = poseProject.value.rig?.controls?.ikTargets2d?.find((cc) => cc.id === hitCtl.controlId);
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
      const mode = animatorShiftMeansTranslate(e) ? "translate" : animatorTool.value;

      boneDrag.value = {
        boneId: hitPose,
        animGrab: animatorBoneDragGrab(hitPose, wx, wy),
        mode,
        rotGrab: mode === "rotate" ? beginAnimatorRotateDrag(hitPose) : undefined,
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
      const mode = animatorShiftMeansTranslate(e) ? "translate" : animatorTool.value;
      boneDrag.value = {
        boneId: fromSprite.boneId,
        animGrab: animatorBoneDragGrab(fromSprite.boneId, wx, wy),
        mode,
        rotGrab: mode === "rotate" ? beginAnimatorRotateDrag(fromSprite.boneId) : undefined,
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
    const s = viewportRigSlices.value.find((x) => x.id === hitSlice);
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

  const meshes = poseProject.value.skinnedMeshes ?? [];
  if (meshes.length === 0) {
    store.clearMeshVertexSelection();
    return;
  }
  const { bindM4, poseM4Draw } = viewportBoneBindPoseAndDrawState();
  const threshold2 = 20 * 20;
  let bestD2 = threshold2;
  let best: { meshId: string; vi: number } | null = null;
  for (const mesh of meshes) {
    const deformed = deformSkinnedMesh(mesh, bindM4, poseM4Draw);
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
      if (rigCameraViewKind.value === "2d") {
        // Hard lock: never rotate view in 2D.
        viewRotation.value = 0;
        viewDrag.value = null;
        draw();
        return;
      }
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
    const b = poseProject.value.bones.find((x) => x.id === d.boneId);
    if (b) {
      const previewBind = { ...b.bindPose, rotation: d.previewRotation };
      const tip = boneLengthAndBindRotationFromWorldTip(
        poseProject.value,
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
      const local = localBindTranslationForWorldOrigin(
        poseProject.value,
        boneDrag.value.boneId,
        wx,
        wy,
        planarBindOpts.value,
      );
      if (local) {
        store.dispatch({ type: "setBindPose", boneId: boneDrag.value.boneId, partial: { x: local.x, y: local.y } });
      }
    } else {
      // Rotate tool must never write tx/ty (or IK targets) from bone drag — only `rot` keys.
      const mode: "rotate" | "translate" =
        animatorTool.value === "rotate" ? "rotate" : (boneDrag.value.mode ?? animatorTool.value);
      if (mode === "translate") {
        const g = boneDrag.value.animGrab;
        const twx = g ? g.j0x + (wx - g.p0x) : wx;
        const twy = g ? g.j0y + (wy - g.p0y) : wy;
        const boneId = boneDrag.value!.boneId;
        const ikEff = ikEffectorChainForBone(boneId);
        if (ikEff) {
          dispatchIkChainWorldTarget(ikEff.chainId, ikEff.kind, twx, twy);
        } else {
          const bone = poseProject.value.bones.find((b) => b.id === boneId);
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
        const bid = boneDrag.value.boneId;
        const rg = boneDrag.value.rotGrab ?? beginAnimatorRotateDrag(bid);
        /** Must match {@link evaluatePose} / `solvedPose` planar opts or tip-snap skews aim vs drawn bones. */
        const desired = poseBoneRotationTowardWorldPoint(
          poseProject.value,
          currentTime.value,
          bid,
          wx,
          wy,
          rg.jointFix,
          planarBindOpts.value,
        );
        const b = poseProject.value.bones.find((x) => x.id === bid);
        if (b && desired != null) {
          store.dispatch({
            type: "addKeyframe",
            boneId: b.id,
            property: "rot",
            t: currentTime.value,
            v: desired - b.bindPose.rotation,
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
  window.addEventListener("keydown", onBoneDeleteKeyDown, true);
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
  window.removeEventListener("keydown", onBoneDeleteKeyDown, true);
});

function onAnimatorToolKeyDown(e: KeyboardEvent) {
  if (characterRigModalOpen.value || quickRigMode.value) return;
  if (workspaceMode.value !== "animate") return;
  if (isTypingInEditableField(e.target)) return;
  if (e.key === "p" || e.key === "P") {
    animatorTool.value = "translate";
    animatorLengthMode.value = false;
    draw();
  }
  if (e.key === "r" || e.key === "R") {
    animatorTool.value = "rotate";
    animatorLengthMode.value = false;
    draw();
  }
  if (e.key === "l" || e.key === "L") {
    animatorLengthMode.value = !animatorLengthMode.value;
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

/** Character Setup / Quick Rig: Delete or Backspace removes selected bone (same rules as hierarchy). */
function onBoneDeleteKeyDown(e: KeyboardEvent) {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (isTypingInEditableField(e.target)) return;
  if (weightBrushEnabled.value) return;
  if (viewDrag.value || boneLengthDrag.value || boneDrag.value || rigSliceDrag.value || ikControlDrag.value) return;
  if (!characterRigModalOpen.value && !quickRigMode.value) return;
  const bid = selectedBoneId.value;
  if (!bid) return;
  const b = poseProject.value.bones.find((x) => x.id === bid);
  if (!b || b.parentId === null) return;
  e.preventDefault();
  e.stopPropagation();
  store.dispatch({ type: "removeBone", boneId: bid });
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

watch([characterRigModalOpen, quickRigMode, workspaceMode], () => {
  if (characterRigModalOpen.value || quickRigMode.value || workspaceMode.value !== "animate") {
    animatorLengthMode.value = false;
  }
});

watch(
  [
    project,
    workspaceMode,
    activeCharacterId,
    rigCharacterSlots,
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
    animatorTool,
    animatorLengthMode,
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
    <div class="viewport-left-stack">
      <div
        v-if="shortcutPanelLines.length > 0"
        class="kbd-hints"
        aria-label="Keyboard shortcuts"
      >
        <div
          v-if="workspaceMode === 'animate' && !quickRigMode"
          class="kbd-active-tool"
        >
          <span class="kbd-active-label">Tool</span>
          <template v-if="animatorLengthMode">
            <span class="kbd-active-name">Length</span>
            <kbd class="kbd-active-key">L</kbd>
          </template>
          <template v-else>
            <span class="kbd-active-name">{{ animatorTool === 'rotate' ? 'Rotate' : 'Translate' }}</span>
            <kbd class="kbd-active-key">{{ animatorTool === 'rotate' ? 'R' : 'P' }}</kbd>
          </template>
        </div>
        <div
          v-for="(line, i) in shortcutPanelLines"
          :key="i"
          class="kbd-line"
          :class="{ 'kbd-line--plain': line.keys.length === 0 }"
        >
          <span v-if="line.keys.length" class="kbd-chips">
            <template v-for="(k, ki) in line.keys" :key="ki">
              <kbd>{{ k }}</kbd>
              <span v-if="ki < line.keys.length - 1" class="kbd-join" aria-hidden="true">·</span>
            </template>
          </span>
          <span class="kbd-desc">{{ line.label }}</span>
        </div>
      </div>
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
      <div class="hint" role="status" aria-live="polite">
        <div v-for="(line, i) in viewportHintLines" :key="i" class="hint-line">{{ line }}</div>
      </div>
    </div>
      <div class="view-toolbar" aria-label="Viewport view">
      <span class="view-toolbar-label">{{ zoomPercent }}%</span>
      <button type="button" class="view-tb-btn" title="Zoom out" @click="zoomViewportOut">−</button>
      <button type="button" class="view-tb-btn" title="Zoom in" @click="zoomViewportIn">+</button>
      <button type="button" class="view-tb-btn view-tb-reset" title="Reset view" @click="resetViewportView">Reset</button>
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
.viewport-left-stack {
  position: absolute;
  bottom: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: min(92vw, 22rem);
  z-index: 3;
  pointer-events: none;
}
.kbd-hints {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.94);
  border: 1px solid #343a46;
  color: #b8c0d0;
  font-size: 0.65rem;
  line-height: 1.45;
  width: 100%;
  box-sizing: border-box;
}
.kbd-active-tool {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid #2d3340;
}
.kbd-active-label {
  color: #7c8494;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.6rem;
}
.kbd-active-name {
  font-weight: 700;
  color: #e5e7eb;
}
.kbd-active-key {
  margin-left: auto;
  padding: 2px 7px;
  border-radius: 5px;
  border: 1px solid #6366f1;
  background: linear-gradient(180deg, #312e52 0%, #252043 100%);
  color: #e0e7ff;
  font-size: 0.68rem;
  font-weight: 700;
}
.kbd-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 8px;
  margin-top: 4px;
}
.kbd-line:first-of-type {
  margin-top: 0;
}
.kbd-line--plain {
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid #2a3140;
  color: #8b95a8;
  font-style: italic;
}
.kbd-line--plain .kbd-desc {
  flex: 1;
  min-width: 0;
}
.kbd-chips {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}
.kbd-chips kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid #3b424e;
  background: #1e2229;
  font-size: 0.62rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #f1f5f9;
}
.kbd-join {
  color: #5c6570;
  font-size: 0.55rem;
  user-select: none;
}
.kbd-desc {
  color: #9ca8b8;
  flex: 1;
  min-width: 8rem;
}
.cam-modes {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  color: #cbd5e1;
  pointer-events: auto;
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
  max-width: 100%;
  padding: 0.35rem 0.55rem;
  border-radius: 6px;
  font-size: 0.68rem;
  line-height: 1.45;
  color: #94a3b8;
  background: rgba(15, 16, 20, 0.88);
  border: 1px solid #2d3340;
  pointer-events: none;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hint-line {
  display: block;
  white-space: normal;
  word-break: break-word;
}
</style>
