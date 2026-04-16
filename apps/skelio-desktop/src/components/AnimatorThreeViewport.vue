<script setup lang="ts">
/**
 * Animator: WebGL (Three.js) preview with real 2D/2.5D/3D camera modes.
 * Uses the same rig binding math as the canvas animator (bound slices follow bones + IK).
 *
 * Note: This is a preview renderer; interaction (dragging bones to write keys) stays in the canvas animator.
 */
import {
  allCharacterRigSlices,
  evaluatePose,
  findCharacterRigBinding,
  findSliceDepthEntry,
  findSliceInCharacterRigs,
  resolveCharacterRigSliceBoundBoneId,
  rigidCharacterRigSliceWorldPose,
  transformPointMat4,
  BONE_LENGTH_HIT_MIN_LOCAL,
  type CharacterRigConfig,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useEditorStore, type RigCameraViewKind } from "../stores/editor.js";
import { orbitControlsHandleWasd } from "../viewportWasd.js";

const store = useEditorStore();
const { project, currentTime, selectedBoneId, selectedCharacterRigSliceId, rigCameraViewKind } = storeToRefs(store);

const containerRef = ref<HTMLDivElement | null>(null);

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

const textureCache = new Map<string, THREE.Texture>();

const matPart = new THREE.MeshStandardMaterial({
  transparent: true,
  alphaTest: 0.02,
  roughness: 0.6,
  side: THREE.DoubleSide,
});
const matPartDim = matPart.clone();
matPartDim.opacity = 0.44;
matPartDim.transparent = true;

const matBone = new THREE.MeshBasicMaterial({ color: 0xc9d0df });
const matBoneSel = new THREE.MeshBasicMaterial({ color: 0xa7b6de });
const matJoint = new THREE.MeshBasicMaterial({ color: 0xc9d0df });
const matJointSel = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

// (hasRig was used for earlier UI gating; keep rendering functions unconditional.)

const solvedPose = computed(() =>
  evaluatePose(project.value, currentTime.value, {
    applyIk: true,
    planar2dNoTiltSpin: rigCameraViewKind.value === "2d",
  }),
);

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
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m.dispose();
    }
  }
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
    controls.minPolarAngle = Math.PI / 2;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minAzimuthAngle = 0;
    controls.maxAzimuthAngle = 0;
    refGrid.visible = false;
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
    controls.target.set(0, 0, 0);
    const dist = perspCamera.position.distanceTo(controls.target);
    if (!Number.isFinite(dist) || dist < 80) {
      perspCamera.position.set(420, -180, 620);
    }
    refGrid.visible = true;
  }
  controls.update();
}

function depthForSlice(sliceId: string): { df: number; db: number } {
  const d = findSliceDepthEntry(project.value, sliceId);
  const df = Math.max(0, d?.maxDepthFront ?? 0);
  const dbRaw = d?.syncBackWithFront ? df : Math.max(0, d?.maxDepthBack ?? 0);
  const db = d?.syncBackWithFront ? df : dbRaw;
  return { df, db };
}

function rebuildSliceMeshes() {
  clearGroup(sliceGroup);
  const slices = allCharacterRigSlices(project.value);
  if (!slices.length) return;

  const poseEval = solvedPose.value;
  const poseM4 = poseEval.solvedWorld4ByBoneId;

  const activeSliceId = selectedCharacterRigSliceId.value;
  for (const s of slices) {
    if (s.width <= 0 || s.height <= 0) continue;
    const found = findSliceInCharacterRigs(project.value, s.id);
    const rig = found?.rig;
    if (!rig) continue;
    const bid = resolveCharacterRigSliceBoundBoneId(project.value, s.id);
    const binding = bid ? findCharacterRigBinding(project.value, s.id) ?? null : null;
    const bindBoneOpts = rigCameraViewKind.value === "2d" ? ({ planar2dNoTiltSpin: true } as const) : undefined;
    const rigid = bid
      ? rigidCharacterRigSliceWorldPose(project.value, bid, s.worldCx, s.worldCy, poseM4, {
          localX: binding?.localX,
          localY: binding?.localY,
          localZ: binding?.localZ,
          rotOffset: binding?.rotOffset,
          bindBoneOpts,
        })
      : null;
    const px = rigid?.cx ?? s.worldCx;
    const py = rigid?.cy ?? s.worldCy;
    const rot = rigid?.rot ?? 0;

    const { tex, texBack } = getSliceAlbedoTextures(s, rig);
    if (!tex) continue;

    const { df, db } = depthForSlice(s.id);
    const depthTotal = df + db;
    const dim = activeSliceId !== null && s.id !== activeSliceId;
    const mkMat = (t: THREE.Texture) => {
      const m = (dim ? matPartDim : matPart).clone() as THREE.MeshStandardMaterial;
      m.map = t;
      m.transparent = true;
      m.alphaTest = 0.02;
      return m;
    };

    if (depthTotal > 1e-3) {
      const geo = new THREE.BoxGeometry(s.width, s.height, depthTotal);
      const sideMat = new THREE.MeshStandardMaterial({ color: 0x4a4d5c, roughness: 0.85 });
      const frontMat = mkMat(tex);
      const backMat = mkMat(texBack ?? tex);
      const mats: THREE.Material[] = [sideMat, sideMat, sideMat, sideMat, frontMat, backMat];
      const mesh = new THREE.Mesh(geo, mats);
      mesh.position.set(px, -py, (db - df) / 2);
      mesh.rotation.z = -rot;
      sliceGroup.add(mesh);
    } else {
      const geo = new THREE.PlaneGeometry(s.width, s.height);
      const mesh = new THREE.Mesh(geo, mkMat(tex));
      mesh.position.set(px, -py, 0);
      mesh.rotation.z = -rot;
      sliceGroup.add(mesh);
    }
  }
}

function rebuildBones() {
  clearGroup(boneLines);
  clearGroup(boneJoints);

  const poseEval = solvedPose.value;
  const poseM4 = poseEval.solvedWorld4ByBoneId;
  const sel = selectedBoneId.value;

  for (const b of project.value.bones) {
    const M = poseM4.get(b.id);
    if (!M) continue;
    const L = b.length <= 1e-6 && b.id === sel ? BONE_LENGTH_HIT_MIN_LOCAL : b.length;
    if (L <= 1e-9) continue;
    const p0 = transformPointMat4(M, 0, 0, 0);
    const p1 = transformPointMat4(M, L, 0, 0);
    const a = new THREE.Vector3(p0.x, -p0.y, p0.z);
    const c = new THREE.Vector3(p1.x, -p1.y, p1.z);
    const dir = c.clone().sub(a);
    const len = dir.length();
    if (len <= 1e-9) continue;
    dir.multiplyScalar(1 / len);
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const isSel = b.id === sel;
    const r = isSel ? 8 : 6;
    const geo = new THREE.CylinderGeometry(r, r * 0.96, len, 14, 1, false);
    const mesh = new THREE.Mesh(geo, isSel ? matBoneSel : matBone);
    mesh.position.copy(mid);
    mesh.position.z = 40;
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    boneLines.add(mesh);
  }

  for (const b of project.value.bones) {
    const M = poseM4.get(b.id);
    if (!M) continue;
    const p0 = transformPointMat4(M, 0, 0, 0);
    const isSel = b.id === sel;
    const r = isSel ? 8.5 : 6.5;
    const geo = new THREE.SphereGeometry(r, 16, 12);
    const mesh = new THREE.Mesh(geo, isSel ? matJointSel : matJoint);
    mesh.position.set(p0.x, -p0.y, p0.z);
    boneJoints.add(mesh);
  }
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
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(el.clientWidth, el.clientHeight, false);
  el.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121316);

  perspCamera = new THREE.PerspectiveCamera(42, 1, 0.5, 50000);
  orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 8000);
  controls = new OrbitControls(perspCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.85);
  const dir = new THREE.DirectionalLight(0xffffff, 0.75);
  dir.position.set(420, -380, 900);

  rootGroup.add(sliceGroup);
  rootGroup.add(boneLines);
  rootGroup.add(boneJoints);
  scene.add(rootGroup);
  scene.add(refGrid);
  scene.add(hemi);
  scene.add(dir);

  applyRigCameraMode(rigCameraViewKind.value);
  window.addEventListener("resize", onResize);

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
  if (animatorWasdKeyHandler) {
    window.removeEventListener("keydown", animatorWasdKeyHandler, true);
    animatorWasdKeyHandler = null;
  }
  controls?.dispose();
  disposeTextureCache();
  if (renderer) {
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

watch(rigCameraViewKind, (k) => applyRigCameraMode(k));
watch([() => project.value, currentTime], () => {
  // rebuild on changes
  rebuildSliceMeshes();
  rebuildBones();
});
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

