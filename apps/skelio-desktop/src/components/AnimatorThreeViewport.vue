<script setup lang="ts">
/**
 * Animator: WebGL (Three.js) preview with real 2D/2.5D/3D camera modes.
 * Uses the same rig binding math as the canvas animator (bound slices follow bones + IK).
 *
 * Note: This is a preview renderer; interaction (dragging bones to write keys) stays in the canvas animator.
 */
import {
  allCharacterRigSlices,
  boneIdsInCharacterSubtree,
  evaluatePose,
  findSliceInCharacterRigs,
  mat4ToMat2dProjection,
  poseBoneRotationTowardWorldPoint,
  resolveCharacterRigSliceBoundBoneId,
  rigSliceSkinnedMeshId,
  transformPointMat4,
  mat4Invert,
  rotationOnly2d,
  type CharacterRigConfig,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useEditorStore, type RigCameraViewKind } from "../stores/editor.js";
import { rebuildBoneOverlayMeshes } from "../viewport/rigViewportBoneOverlay.js";
import { orbitControlsHandleWasd } from "../viewportWasd.js";
import { applyRigCamera2d } from "../viewport/rigCamera2d.js";
import { applyRigCamera25d } from "../viewport/rigCamera25d.js";
import { applyRigCamera3d } from "../viewport/rigCamera3d.js";
import { RigGpuSkinner } from "../viewport/rigGpuSkinning.js";

const store = useEditorStore();
const {
  project,
  currentTime,
  selectedBoneId,
  selectedCharacterRigSliceId,
  rigCameraViewKind,
  rigCharacterSlots,
  activeCharacterId,
  ikSolveInViewport,
  animatorTool,
} = storeToRefs(store);

const containerRef = ref<HTMLDivElement | null>(null);

const raycaster = new THREE.Raycaster();
const rigWorldPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const drag = ref<
  | null
  | {
      kind: "bone";
      boneId: string;
      mode: "rotate" | "translate";
      jointFix: { x: number; y: number };
      grab?: { j0x: number; j0y: number; p0x: number; p0y: number };
    }
>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let perspCamera: THREE.PerspectiveCamera | null = null;
let orthoCamera: THREE.OrthographicCamera | null = null;
let controls: OrbitControls | null = null;
let animId = 0;
let animatorWasdKeyHandler: ((e: KeyboardEvent) => void) | null = null;

const rootGroup = new THREE.Group();
const sliceGroup = new THREE.Group();
const boneLines = new THREE.Group();
const boneJoints = new THREE.Group();
const refGrid = new THREE.GridHelper(1800, 36, 0x333333, 0x222222);

const gpuSkinner = new RigGpuSkinner();
let gpuSkeleton: THREE.Skeleton | null = null;

const textureCache = new Map<string, THREE.Texture>();

const matPart = new THREE.MeshStandardMaterial({
  transparent: true,
  alphaTest: 0,
  roughness: 0.6,
  side: THREE.DoubleSide,
});
const matPartDim = matPart.clone();
matPartDim.opacity = 0.44;
matPartDim.transparent = true;

// Match CharacterRigThreeViewport bone materials (readable on top of slices).
const matBone = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9, metalness: 0.0 });
const matBoneSel = new THREE.MeshStandardMaterial({ color: 0xa5b4fc, roughness: 0.75, metalness: 0.0 });
const matJoint = new THREE.MeshBasicMaterial({ color: 0xd4d9e6 });
const matJointSel = new THREE.MeshBasicMaterial({ color: 0xc9d6f5 });
matBone.depthTest = false;
matBone.depthWrite = false;
matBoneSel.depthTest = false;
matBoneSel.depthWrite = false;
matJoint.depthTest = false;
matJoint.depthWrite = false;
matJointSel.depthTest = false;
matJointSel.depthWrite = false;

const boneOverlayKeepMaterials = new Set<THREE.Material>([matBone, matBoneSel, matJoint, matJointSel]);

// (hasRig was used for earlier UI gating; keep rendering functions unconditional.)

/** Planar 2D options aligned with Character Setup (`planar2dClosedFkChainOpts` — closed FK / tip snap). */
const solvedPose = computed(() =>
  evaluatePose(project.value, currentTime.value, {
    applyIk: ikSolveInViewport.value,
    planar2dNoTiltSpin: rigCameraViewKind.value === "2d",
  }),
);

/**
 * Multi-character: same subtree filter as CharacterRigThreeViewport so bone overlay matches Setup.
 */
const animatorViewportBones = computed(() => {
  const p = project.value;
  const slots = rigCharacterSlots.value;
  if (slots.length <= 1) return p.bones;
  const aid = activeCharacterId.value ?? slots[0]?.id;
  const slot = aid ? slots.find((s) => s.id === aid) : undefined;
  if (!slot) return p.bones;
  const allow = boneIdsInCharacterSubtree(p, slot.rootBoneId);
  return p.bones.filter((b) => allow.has(b.id));
});

const autoMeshSyncAttempted = ref(false);

function activeCamera(): THREE.Camera {
  return rigCameraViewKind.value === "2d" && orthoCamera ? orthoCamera : perspCamera!;
}

function disposeTextureCache() {
  for (const t of textureCache.values()) t.dispose();
  textureCache.clear();
}

function clearGroup(g: THREE.Group) {
  while (g.children.length) {
    const o = g.children[0]!;
    g.remove(o);
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      const keep = (mm: THREE.Material) =>
        mm === matBone || mm === matBoneSel || mm === matJoint || mm === matJointSel;
      if (Array.isArray(m)) m.forEach((mm) => !keep(mm) && mm.dispose());
      else if (!keep(m)) m.dispose();
    }
  }
}

function ensureGpuSkeleton(): void {
  gpuSkeleton = gpuSkinner.ensureSkeleton(
    project.value,
    rootGroup,
    rigCameraViewKind.value === "2d" ? "2d" : rigCameraViewKind.value === "2.5d" ? "2.5d" : "3d",
  );
}

function updateGpuBonesFromPose(poseWorldByBoneId: Map<string, Float64Array>): void {
  if (!gpuSkeleton) ensureGpuSkeleton();
  if (!gpuSkeleton) return;
  // For 2D, feed rotation-only bind/pose matrices already (handled inside `RigGpuSkinner.ensureSkeleton` for bind).
  if (rigCameraViewKind.value === "2d") {
    const out = new Map<string, Float64Array>();
    for (const b of project.value.bones) {
      const m4 = poseWorldByBoneId.get(b.id);
      if (!m4) continue;
      // Derive the 2D rotation-only pose from the same 4×4 map that drives bone drawing,
      // so the GPU skeleton cannot diverge (divergence shows up as limbs "getting longer/shorter" on rotate).
      const m2 = mat4ToMat2dProjection(m4);
      const m = rotationOnly2d(m2);
      out.set(
        b.id,
        new Float64Array([m.a, m.b, 0, 0, m.c, m.d, 0, 0, 0, 0, 1, 0, m.e, m.f, 0, 1]),
      );
    }
    gpuSkinner.updateFromPoseWorld(project.value, out, "2d");
  } else {
    gpuSkinner.updateFromPoseWorld(
      project.value,
      poseWorldByBoneId,
      rigCameraViewKind.value === "2.5d" ? "2.5d" : "3d",
    );
  }
}

function worldFromPointerEvent(e: PointerEvent): { wx: number; wy: number } | null {
  const el = containerRef.value;
  const cam = activeCamera();
  if (!el || !cam) return null;
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(x, y), cam);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(rigWorldPlane, pt)) return null;
  return { wx: pt.x, wy: -pt.y };
}

function intersectObjects(e: PointerEvent): THREE.Intersection[] {
  const el = containerRef.value;
  const cam = activeCamera();
  if (!el || !cam) return [];
  const rect = el.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(x, y), cam);
  const objs: THREE.Object3D[] = [];
  sliceGroup.traverse((o) => {
    if ((o as any).isMesh) objs.push(o);
  });
  boneLines.traverse((o) => {
    if ((o as any).isMesh) objs.push(o);
  });
  boneJoints.traverse((o) => {
    if ((o as any).isMesh) objs.push(o);
  });
  return raycaster.intersectObjects(objs, false);
}

function pick(e: PointerEvent): { kind: "bone"; boneId: string } | { kind: "slice"; sliceId: string; boneId: string } | null {
  const hits = intersectObjects(e);
  for (const h of hits) {
    const ud: any = (h.object as any).userData;
    if (ud?.kind === "bone" && typeof ud.boneId === "string") return { kind: "bone", boneId: ud.boneId };
    if (ud?.kind === "slice" && typeof ud.sliceId === "string" && typeof ud.boneId === "string") {
      return { kind: "slice", sliceId: ud.sliceId, boneId: ud.boneId };
    }
  }
  return null;
}

function onAnimatorToolKeyDown(e: KeyboardEvent) {
  // Tool state is owned by the store (ViewportPanel updates UI badges/hints).
  if (e.key === "p" || e.key === "P") store.setAnimatorTool("translate");
  if (e.key === "r" || e.key === "R") store.setAnimatorTool("rotate");
}

function onPointerDown(e: PointerEvent) {
  // Camera interaction gating:
  // - Plain LMB is reserved for tools (pick/drag bones/slices).
  // - Camera controls only via Alt+LMB / MMB / RMB.
  if (controls) {
    controls.enabled = e.altKey || e.button === 1 || e.button === 2;
  }
  if (e.button !== 0) return;
  e.stopImmediatePropagation();
  const hit = pick(e);
  if (!hit) return;
  // Ensure we keep receiving move/up events even if the cursor leaves the canvas.
  try {
    (renderer?.domElement as HTMLElement | undefined)?.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  e.preventDefault();
  if (hit.kind === "slice") {
    store.selectCharacterRigSlice(hit.sliceId);
    store.selectBone(hit.boneId);
    return;
  }
  store.selectBone(hit.boneId);
  const w = worldFromPointerEvent(e);
  if (!w) return;
  const poseEval = solvedPose.value;
  const M = poseEval.solvedWorld4ByBoneId.get(hit.boneId);
  const j = M ? transformPointMat4(M, 0, 0, 0) : { x: w.wx, y: w.wy };
  const mode = animatorTool.value;
  drag.value = {
    kind: "bone",
    boneId: hit.boneId,
    mode,
    jointFix: { x: j.x, y: j.y },
    grab: mode === "translate" ? { j0x: j.x, j0y: j.y, p0x: w.wx, p0y: w.wy } : undefined,
  };
}

function onPointerMove(e: PointerEvent) {
  const d = drag.value;
  if (!d) return;
  if (controls) controls.enabled = false;
  e.stopImmediatePropagation();
  const w = worldFromPointerEvent(e);
  if (!w) return;
  e.preventDefault();
  // Safety: default to rotate unless the user explicitly selected translate.
  if (d.mode !== animatorTool.value) {
    d.mode = animatorTool.value;
  }
  const boneId = d.boneId;
  if (d.mode === "translate") {
    const g = d.grab;
    const twx = g ? g.j0x + (w.wx - g.p0x) : w.wx;
    const twy = g ? g.j0y + (w.wy - g.p0y) : w.wy;
    const bone = project.value.bones.find((b) => b.id === boneId);
    const local = (() => {
      if (!bone) return null;
      if (bone.parentId === null) return { x: twx, y: twy };
      const parentW4 = solvedPose.value.solvedWorld4ByBoneId.get(bone.parentId);
      if (!parentW4) return null;
      const invP = mat4Invert(parentW4);
      if (!invP) return null;
      const p = transformPointMat4(invP, twx, twy, 0);
      return { x: p.x, y: p.y };
    })();
    if (local) {
      store.dispatch({ type: "setBoneTranslationKeysAtTime", boneId, t: currentTime.value, x: local.x, y: local.y });
    }
  } else {
    const desired = poseBoneRotationTowardWorldPoint(
      project.value,
      currentTime.value,
      boneId,
      w.wx,
      w.wy,
      d.jointFix,
      rigCameraViewKind.value === "2d" ? { planar2dNoTiltSpin: true } : undefined,
    );
    const b = project.value.bones.find((x) => x.id === boneId);
    if (b && desired != null) {
      store.dispatch({ type: "addKeyframe", boneId, property: "rot", t: currentTime.value, v: desired - b.bindPose.rotation });
    }
  }
}

function onPointerUp(_e: PointerEvent) {
  if (controls) controls.enabled = true;
  const el = renderer?.domElement as HTMLElement | undefined;
  if (el && el.hasPointerCapture(_e.pointerId)) {
    try {
      el.releasePointerCapture(_e.pointerId);
    } catch {
      /* ignore */
    }
  }
  // Animator viewport never mutates rig slice positions; keep rig editing in Character Setup.
  drag.value = null;
}

function getOrLoadTexture(key: string, dataUrl: string): THREE.Texture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const loader = new THREE.TextureLoader();
  const t = loader.load(dataUrl, () => {
    // rebuild once the image is available
    rebuildSliceMeshes();
  });
  textureCache.set(key, t);
  return t;
}

function sheetRegionCacheSuffix(s: CharacterRigSpriteSlice): string {
  return `${s.x}:${s.y}:${s.width}:${s.height}:${s.sheetId ?? ""}`;
}

function sheetPixelSize(sh: CharacterRigSpriteSheetEntry, baseTex: THREE.Texture): { w: number; h: number } {
  const img = baseTex.image as HTMLImageElement | undefined;
  const w = sh.pixelWidth && sh.pixelWidth > 0 ? sh.pixelWidth : Math.max(1, img?.naturalWidth ?? img?.width ?? 1);
  const h = sh.pixelHeight && sh.pixelHeight > 0 ? sh.pixelHeight : Math.max(1, img?.naturalHeight ?? img?.height ?? 1);
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
 * CanvasTexture (nicht DataURL + TextureLoader): synchron, flipY wie Three erwartet — sonst oft vertikal gespiegelt.
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
function getSliceAlbedoTextures(s: CharacterRigSpriteSlice, rig: CharacterRigConfig): { tex?: THREE.Texture; texBack?: THREE.Texture } {
  let tex: THREE.Texture | undefined;
  let texBack: THREE.Texture | undefined;
  if (s.embedded?.dataBase64) {
    tex = getOrLoadTexture(`emb:${s.id}:front`, `data:${s.embedded.mimeType};base64,${s.embedded.dataBase64}`);
  } else if (s.sheetId) {
    const sh = rig.spriteSheets?.find((x) => x.id === s.sheetId);
    if (sh?.dataBase64) {
      const baseTex = getOrLoadTexture(`sh:${s.sheetId}`, `data:${sh.mimeType};base64,${sh.dataBase64}`);
      tex = textureFromSheetCanvasCrop(s, baseTex) ?? makeSheetUvFallbackTexture(sh, s, baseTex);
    }
  }
  if (s.embeddedBack?.dataBase64) {
    texBack = getOrLoadTexture(`emb:${s.id}:back`, `data:${s.embeddedBack.mimeType};base64,${s.embeddedBack.dataBase64}`);
  } else if (tex) {
    texBack = tex;
  }
  return { tex, texBack };
}

function applyRigCameraMode(kind: RigCameraViewKind) {
  if (!controls || !perspCamera || !orthoCamera) return;
  const el = containerRef.value;
  if (!el) return;
  if (kind === "2d") {
    // Match CharacterRigThreeViewport ortho framing (fixed world half-height).
    applyRigCamera2d({
      controls,
      perspCamera,
      orthoCamera,
      element: el,
      halfHeightWorld: 420,
    });
    refGrid.visible = false;
  } else if (kind === "2.5d") {
    applyRigCamera25d({ controls, perspCamera, orthoCamera, element: el });
    refGrid.visible = true;
  } else {
    applyRigCamera3d({ controls, perspCamera, orthoCamera, element: el });
    refGrid.visible = true;
  }
}

function rebuildSliceMeshes() {
  clearGroup(sliceGroup);
  const slices = allCharacterRigSlices(project.value);
  if (!slices.length) return;

  // Rigid sprite planes are removed; if a project loads without prebuilt `rig_slice_*` meshes,
  // auto-generate them once when possible so characters still appear.
  if (!autoMeshSyncAttempted.value) {
    const skinMeshes = project.value.skinnedMeshes ?? [];
    let missing = false;
    for (const s of slices) {
      if (s.width <= 0 || s.height <= 0) continue;
      const bid = resolveCharacterRigSliceBoundBoneId(project.value, s.id);
      if (!bid) continue;
      if (!skinMeshes.some((m) => m.id === rigSliceSkinnedMeshId(s.id))) {
        missing = true;
        break;
      }
    }
    if (missing) {
      // Only mark as attempted when the command actually applied (bindings complete).
      // Otherwise we must keep retrying after the user completes binding.
      const ok = store.dispatch({ type: "syncCharacterRigSkinnedMeshes" });
      if (ok) autoMeshSyncAttempted.value = true;
    }
  }

  if (!gpuSkeleton) ensureGpuSkeleton();
  if (!gpuSkeleton) return;

  const poseEval = solvedPose.value;
  updateGpuBonesFromPose(poseEval.solvedWorld4ByBoneId);
  const cam2d = rigCameraViewKind.value === "2d";

  const activeSliceId = selectedCharacterRigSliceId.value;
  for (const s of slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const found = findSliceInCharacterRigs(project.value, s.id);
    const rig = found?.rig;
    if (!rig) continue;
    const bid = resolveCharacterRigSliceBoundBoneId(project.value, s.id);
    // Only render the generated rig skinned mesh. Rigid planes are intentionally removed.
    const skinMeshes = project.value.skinnedMeshes ?? [];
    const sm = skinMeshes.find((m) => m.id === rigSliceSkinnedMeshId(s.id)) ?? null;
    if (!sm) continue;

    const { tex } = getSliceAlbedoTextures(s, rig);
    if (!tex) continue;

    const dim = activeSliceId !== null && s.id !== activeSliceId;
    const geo = gpuSkinner.buildSliceGeometry(s, sm);
    if (!geo) continue;

    const map = tex;
    const mat = cam2d
      ? new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity: dim ? 0.44 : 1,
          // Some generated meshes have opposite winding; in 2D we prefer visibility over culling.
          side: THREE.DoubleSide,
        })
      : ((dim ? matPartDim : matPart).clone() as THREE.MeshStandardMaterial);
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.map = map;
      mat.transparent = true;
      mat.opacity = dim ? 0.44 : 1;
      mat.side = THREE.FrontSide;
    } else {
      mat.depthTest = false;
      mat.depthWrite = false;
    }
    // `skinning` is a runtime material flag (Three sets shader defines from it).
    (mat as any).skinning = true;

    const sk = new THREE.SkinnedMesh(geo, mat);
    sk.frustumCulled = false;
    sk.bind(gpuSkeleton, new THREE.Matrix4());
    // Match CharacterRigThreeViewport: slices stay under bone overlay (renderOrder 3/4). Using loop
    // index `i` here pushed later slices above bones and hid the full skeleton in Animate.
    sk.renderOrder = 1;
    sk.userData = { kind: "slice", sliceId: s.id, boneId: bid };
    sliceGroup.add(sk);
  }
}

function rebuildBones() {
  const poseEval = solvedPose.value;
  const selBid = selectedBoneId.value;
  const bonesList = animatorViewportBones.value;

  rebuildBoneOverlayMeshes({
    boneLines,
    boneJoints,
    keepMaterials: boneOverlayKeepMaterials,
    bonesList,
    boneM4: poseEval.solvedWorld4ByBoneId,
    boneO: poseEval.solvedOriginByBoneId,
    selectedBoneId: selBid,
    rigBoneInteractive: true,
    lengthPreviewBoneId: null,
    effectiveLength: (b) => b.length,
    matBone,
    matBoneSel,
    matJoint,
    matJointSel,
    shaftHighlightRequiresInteractive: false,
  });
}

function onResize() {
  const el = containerRef.value;
  if (!el || !renderer || !perspCamera || !orthoCamera) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  renderer.setSize(w, h, false);
  applyRigCameraMode(rigCameraViewKind.value);
}

function animate() {
  animId = requestAnimationFrame(animate);
  controls?.update();
  rebuildSliceMeshes();
  rebuildBones();
  if (renderer && scene) {
    renderer.render(scene, activeCamera());
  }
}

onMounted(() => {
  const el = containerRef.value;
  if (!el) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  perspCamera = new THREE.PerspectiveCamera(42, 1, 0.5, 50000);
  orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000);
  controls = new OrbitControls(perspCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;

  // Same lighting recipe as CharacterRigThreeViewport so MeshStandard bone colors match Setup.
  const amb = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffffff, 0.55);
  dir.position.set(200, 400, 600);
  scene.add(dir);

  rootGroup.add(sliceGroup);
  scene.add(rootGroup);
  // Draw bone overlay after the whole rig group so transparent skinned slices cannot paint over it.
  scene.add(boneLines);
  scene.add(boneJoints);
  scene.add(refGrid);

  applyRigCameraMode(rigCameraViewKind.value);
  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", onAnimatorToolKeyDown, true);
  renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
  renderer.domElement.addEventListener("pointermove", onPointerMove, true);
  renderer.domElement.addEventListener("pointerup", onPointerUp, true);
  renderer.domElement.addEventListener("pointercancel", onPointerUp, true);

  animatorWasdKeyHandler = (e: KeyboardEvent) => {
    if (!controls) return;
    if (orbitControlsHandleWasd(controls, e)) e.preventDefault();
  };
  window.addEventListener("keydown", animatorWasdKeyHandler, true);

  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animId);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("keydown", onAnimatorToolKeyDown, true);
  if (animatorWasdKeyHandler) {
    window.removeEventListener("keydown", animatorWasdKeyHandler, true);
    animatorWasdKeyHandler = null;
  }
  controls?.dispose();
  disposeTextureCache();
  if (renderer) {
    renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
    renderer.domElement.removeEventListener("pointermove", onPointerMove, true);
    renderer.domElement.removeEventListener("pointerup", onPointerUp, true);
    renderer.domElement.removeEventListener("pointercancel", onPointerUp, true);
    renderer.dispose();
    const el = containerRef.value;
    if (el && renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
  }
  renderer = null;
  scene = null;
  perspCamera = null;
  orthoCamera = null;
  controls = null;
});

watch(rigCameraViewKind, (k) => {
  // Bone bind inverses depend on camera mode (2D rotation-only vs full 4×4).
  // Rebuild skeleton on mode switch to avoid mixing modes.
  gpuSkeleton = null;
  applyRigCameraMode(k);
});
watch([() => project.value, currentTime], () => {
  // rebuild on changes
  rebuildSliceMeshes();
  rebuildBones();
});
watch(
  () => project.value,
  () => {
    autoMeshSyncAttempted.value = false;
  },
);
</script>

<template>
  <div ref="containerRef" class="anim-three-viewport" />
</template>

<style scoped>
.anim-three-viewport {
  width: 100%;
  height: 100%;
  min-height: 320px;
}
</style>

