<script setup lang="ts">
import {
  characterRigBindingsComplete,
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
  RIG_SLICE_MESH_ID_PREFIX,
  worldBindOrigins,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, toRaw, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { generateRegeneratedDepthTexturePayload } from "../slicePixelToolkit.js";
import CharacterRigThreeViewport from "./CharacterRigThreeViewport.vue";
import SpriteSliceEditPanel from "./SpriteSliceEditPanel.vue";
import DepthTextureEditorModal from "./DepthTextureEditorModal.vue";

const store = useEditorStore();
const {
  project,
  characterRigModalOpen,
  selectedCharacterRigSliceId,
  selectedBoneId,
  selectedBone,
  sheetSliceModalOpen,
  placeNewBonesAtParentTip,
  rigCameraViewKind,
} = storeToRefs(store);

const step = ref(0);
const sheetInput = ref<HTMLInputElement | null>(null);
/** Part details (sprite modal). */
const spriteModalSliceId = ref<string | null>(null);
const partEditName = ref("");
const partEditSide = ref<"front" | "back">("front");

const depthTextureModalOpen = ref(false);
const depthTextureModalSliceId = ref<string | null>(null);
const depthTextureModalSide = ref<"front" | "back">("front");
/** Short feedback after “generate meshes from rig”. */
const meshSyncFeedback = ref("");

/** Smack-like default extrusion (max depth). */
const DEFAULT_SLICE_MAX_DEPTH = 8;

const depthRegenBusy = ref<"front" | "back" | null>(null);

/** HTML5 DnD: sprite draw order (list order). */
const sliceDragSourceId = ref<string | null>(null);
const sliceDropHighlightId = ref<string | "end" | null>(null);

const selectedSliceFor3d = computed(() => {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return null;
  return slices.value.find((s) => s.id === id) ?? null;
});

const partModalSlice = computed(() => {
  const id = spriteModalSliceId.value;
  if (!id) return null;
  return slices.value.find((s) => s.id === id) ?? null;
});

watch(spriteModalSliceId, (id) => {
  if (!id) return;
  const s = project.value.characterRig?.slices?.find((x) => x.id === id);
  if (!s) return;
  partEditName.value = s.name;
  partEditSide.value = s.side === "back" ? "back" : "front";
});

const steps = [
  {
    id: "sprites",
    title: "Sprites",
    hint: "Left: + New adds a part. Drag handle (⋮⋮) reorders — lower in the list draws later (on top). Sheets on the right; arrange in the center.",
  },
  {
    id: "bones",
    title: "Bones",
    hint: "Hierarchy; place/drag in the viewport. Right: 2D bind pose + 3D bind pose (Z / depth offset) for in-front / behind. Length: Shift+joint drag.",
  },
  {
    id: "bind",
    title: "Bind",
    hint: "Part → bone; generate rig meshes. Max depth / depth maps / regenerate in the “3D Settings” step (Smack-style workflow).",
  },
  {
    id: "depth",
    title: "3D Settings",
    hint: "Selected part: front/back max depth, map thumbnails, edit & regenerate. Viewport shows only this part. Bone depth: “Bones” step.",
  },
  { id: "preview", title: "Preview", hint: "Overview — available only after binding is complete." },
] as const;

const rig = computed(() => project.value.characterRig);
const slices = computed(() => rig.value?.slices ?? []);
const spriteSheets = computed(() => rig.value?.spriteSheets ?? []);
const bindings = computed(() => rig.value?.bindings ?? []);

const rigBindingsComplete = computed(() => characterRigBindingsComplete(project.value));

function goToRigStep(i: number) {
  if ((i === 3 || i === 4) && !rigBindingsComplete.value) {
    alert(
      '“3D Settings” and “Preview” unlock only after every part with pixels is assigned to a bone (“Bind” step).',
    );
    return;
  }
  step.value = i;
}

watch([rigBindingsComplete, step], () => {
  if (!rigBindingsComplete.value && (step.value === 3 || step.value === 4)) {
    step.value = 2;
  }
});

watch(characterRigModalOpen, (open) => {
  if (!open) meshSyncFeedback.value = "";
  if (open && !rigBindingsComplete.value && (step.value === 3 || step.value === 4)) {
    step.value = 2;
  }
});

const bonesSorted = computed(() =>
  [...project.value.bones].sort((a, b) => a.name.localeCompare(b.name)),
);

/** Bones in tree order (root first, children sorted by name). */
const bonesHierarchy = computed(() => {
  const bones = project.value.bones;
  const byId = new Map(bones.map((b) => [b.id, b]));
  const root = bones.find((b) => b.parentId === null);
  if (!root) return [] as { id: string; name: string; depth: number }[];
  const out: { id: string; name: string; depth: number }[] = [];
  function walk(id: string, depth: number) {
    const b = byId.get(id);
    if (!b) return;
    out.push({ id: b.id, name: b.name, depth });
    const kids = bones
      .filter((x) => x.parentId === id)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const k of kids) walk(k.id, depth + 1);
  }
  walk(root.id, 0);
  return out;
});

/** Step 0: sheets only; step 1: bones left + hint right; from Bind on, sheets + bone list. */
const showSheetColumn = computed(() => step.value !== 1);
const showBoneColumn = computed(() => step.value >= 2);

/** Distance parent joint → selected bone (bind-pose world); Smack-style length without an extra field. */
const selectedBoneParentSpan = computed(() => {
  const b = selectedBone.value;
  if (!b?.parentId) return null;
  const o = worldBindOrigins(project.value);
  const p = o.get(b.parentId);
  const c = o.get(b.id);
  if (!p || !c) return null;
  return Math.hypot(c.x - p.x, c.y - p.y);
});

watch(
  [step, characterRigModalOpen],
  () => {
    if (characterRigModalOpen.value) store.setCharacterRigModalStep(step.value);
  },
  { immediate: true },
);

watch(step, (s) => {
  if (s !== 1) store.setPendingBonePlacement(null);
  if (s === 3 && characterRigModalOpen.value) {
    const sid = selectedCharacterRigSliceId.value;
    const valid =
      sid && slices.value.some((x) => x.id === sid && x.width > 0 && x.height > 0);
    if (!valid) {
      const first = slices.value.find((x) => x.width > 0 && x.height > 0);
      if (first) store.selectCharacterRigSlice(first.id);
    }
  }
});

function bindingBoneId(sliceId: string): string {
  return bindings.value.find((b) => b.sliceId === sliceId)?.boneId ?? "";
}

function onSpriteRailRowClick(sliceId: string) {
  if (step.value === 3) {
    const bid = bindingBoneId(sliceId);
    if (bid) store.selectBone(bid);
  }
  store.selectCharacterRigSlice(sliceId);
}

function rigModalBindBone3d(field: "z" | "depthOffset" | "tilt" | "spin"): number {
  const b = selectedBone.value;
  if (!b?.bindBone3d) return 0;
  return b.bindBone3d[field];
}

function patchSelectedBindBone3d(field: "z" | "depthOffset" | "tilt" | "spin", ev: Event) {
  const id = selectedBoneId.value;
  if (!id) return;
  const n = Number((ev.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({ type: "setBindBone3d", boneId: id, partial: { [field]: n } });
}

function depthFor(sliceId: string) {
  const d = rig.value?.sliceDepths?.find((x) => x.sliceId === sliceId);
  return {
    maxDepthFront: d?.maxDepthFront ?? 0,
    maxDepthBack: d?.maxDepthBack ?? 0,
    syncBackWithFront: d?.syncBackWithFront ?? true,
  };
}

function close() {
  store.closeCharacterRigModal();
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  if (sheetSliceModalOpen.value) {
    store.closeSheetSliceModal();
    return;
  }
  if (spriteModalSliceId.value) {
    closePartModal();
    return;
  }
  close();
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

function setBinding(sliceId: string, boneId: string) {
  if (!boneId) store.dispatch({ type: "clearCharacterRigBinding", sliceId });
  else store.dispatch({ type: "setCharacterRigBinding", sliceId, boneId });
}

function onSliceGripDragStart(sliceId: string, e: DragEvent) {
  sliceDragSourceId.value = sliceId;
  e.dataTransfer?.setData("application/x-skelio-slice-id", sliceId);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}

function onSliceRowDragOver(sliceId: string, e: DragEvent) {
  if (!sliceDragSourceId.value || sliceDragSourceId.value === sliceId) return;
  e.preventDefault();
  sliceDropHighlightId.value = sliceId;
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

function onSliceTailDragOver(e: DragEvent) {
  if (!sliceDragSourceId.value) return;
  e.preventDefault();
  sliceDropHighlightId.value = "end";
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
}

function onSliceRowDrop(sliceId: string, e: DragEvent) {
  e.preventDefault();
  const src = sliceDragSourceId.value ?? e.dataTransfer?.getData("application/x-skelio-slice-id") ?? null;
  sliceDropHighlightId.value = null;
  sliceDragSourceId.value = null;
  if (!src || src === sliceId) return;
  store.dispatch({ type: "reorderCharacterRigSlice", sliceId: src, insertBeforeSliceId: sliceId });
}

function onSliceDropAppendEnd(e: DragEvent) {
  e.preventDefault();
  const src = sliceDragSourceId.value ?? e.dataTransfer?.getData("application/x-skelio-slice-id") ?? null;
  sliceDropHighlightId.value = null;
  sliceDragSourceId.value = null;
  if (!src) return;
  store.dispatch({ type: "reorderCharacterRigSlice", sliceId: src, insertBeforeSliceId: null });
}

function onSliceRailDragEnd() {
  sliceDragSourceId.value = null;
  sliceDropHighlightId.value = null;
}

function setDepth(sliceId: string, front: number, back: number, sync: boolean) {
  store.dispatch({
    type: "setCharacterRigSliceDepth",
    sliceId,
    maxDepthFront: front,
    maxDepthBack: back,
    syncBackWithFront: sync,
  });
}

function depthTextureThumbDataUrl(sliceId: string, side: "front" | "back"): string {
  const d = rig.value?.sliceDepths?.find((x) => x.sliceId === sliceId) as
    | {
        depthTextureFront?: { mimeType: string; dataBase64: string };
        depthTextureBack?: { mimeType: string; dataBase64: string };
      }
    | undefined;
  const t = side === "front" ? d?.depthTextureFront : d?.depthTextureBack;
  if (!t?.mimeType || !t?.dataBase64) return "";
  return `data:${t.mimeType};base64,${t.dataBase64}`;
}

async function regenerateDepthTexture(side: "front" | "back") {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  depthRegenBusy.value = side;
  try {
    const payload = await generateRegeneratedDepthTexturePayload(toRaw(project.value), id, side);
    if (!payload?.dataBase64) {
      alert("No sprite pixels for this part — set front art first (sheet or embedded).");
      return;
    }
    const ok = store.dispatch({
      type: "setCharacterRigSliceDepthTexture",
      sliceId: id,
      side,
      mimeType: payload.mimeType,
      dataBase64: payload.dataBase64,
      pixelWidth: payload.pixelWidth,
      pixelHeight: payload.pixelHeight,
    });
    if (!ok) alert("Depth map could not be saved (validation).");
  } finally {
    depthRegenBusy.value = null;
  }
}

function setDefaultDepthFront() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const d = depthFor(id);
  const sync = d.syncBackWithFront;
  setDepth(id, DEFAULT_SLICE_MAX_DEPTH, sync ? DEFAULT_SLICE_MAX_DEPTH : d.maxDepthBack, sync);
}

function setDefaultDepthBack() {
  const id = selectedCharacterRigSliceId.value;
  if (!id) return;
  const d = depthFor(id);
  if (d.syncBackWithFront) {
    setDepth(id, DEFAULT_SLICE_MAX_DEPTH, DEFAULT_SLICE_MAX_DEPTH, true);
  } else {
    setDepth(id, d.maxDepthFront, DEFAULT_SLICE_MAX_DEPTH, false);
  }
}

function syncMeshingFromRig() {
  if (!rigBindingsComplete.value) {
    alert(
      "Meshes can only be generated after every part with pixels is assigned to a bone (“Bind” step).",
    );
    return;
  }
  const countBefore = rigGeneratedMeshCount.value;
  const ok = store.dispatch({ type: "syncCharacterRigSkinnedMeshes" });
  if (!ok) {
    meshSyncFeedback.value = "";
    alert("Mesh sync rejected (validation). Check bindings and parts with pixels.");
    return;
  }
  const n = rigGeneratedMeshCount.value;
  store.setRigCameraViewKind("3d");
  step.value = 3;
  meshSyncFeedback.value =
    n === countBefore && n > 0
      ? `Updated: ${n} rig mesh(es). Open “3D Settings” for depth maps & preview.`
      : `Done: ${n} rig mesh(es). Continue in “3D Settings” (depth maps).`;
}

/** Project rig data and `skinnedMeshes` stay in sync — write meshes from rig before returning to the main editor. */
function finishRigAndClose() {
  if (!rigBindingsComplete.value) {
    alert(
      "Finish is only available after every part with pixels is assigned to a bone (“Bind” step).",
    );
    return;
  }
  const ok = store.dispatch({ type: "syncCharacterRigSkinnedMeshes" });
  if (!ok) {
    alert("Mesh sync rejected (validation). Check bindings and parts with pixels, then try “Done” again.");
    return;
  }
  const meshes = project.value.skinnedMeshes ?? [];
  const firstRig = meshes.find((m) => m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX));
  if (firstRig) store.selectMeshOnly(firstRig.id);
  close();
}

const rigGeneratedMeshCount = computed(
  () => project.value.skinnedMeshes?.filter((m) => m.id.startsWith(RIG_SLICE_MESH_ID_PREFIX)).length ?? 0,
);

function thumbDataUrl(s: CharacterRigSpriteSlice): string {
  const em = s.embedded;
  if (!em?.dataBase64 || !em.mimeType) return "";
  return `data:${em.mimeType};base64,${em.dataBase64}`;
}

function openPartModal(sliceId: string) {
  spriteModalSliceId.value = sliceId;
  store.selectCharacterRigSlice(sliceId);
}

function closePartModal() {
  spriteModalSliceId.value = null;
}

function openDepthTextureModal(sliceId: string, side: "front" | "back") {
  depthTextureModalSliceId.value = sliceId;
  depthTextureModalSide.value = side;
  depthTextureModalOpen.value = true;
}

function closeDepthTextureModal() {
  depthTextureModalOpen.value = false;
  depthTextureModalSliceId.value = null;
}

function applyPartModal() {
  const id = spriteModalSliceId.value;
  if (!id) return;
  const ok = store.dispatch({
    type: "patchCharacterRigSlice",
    sliceId: id,
    name: partEditName.value,
    side: partEditSide.value,
  });
  if (!ok) alert("Save failed (project validation). See console for details.");
  else closePartModal();
}

function setSliceSide(sliceId: string, side: "front" | "back") {
  store.dispatch({ type: "patchCharacterRigSlice", sliceId, side });
}

function onSliceNameChange(s: CharacterRigSpriteSlice, e: Event) {
  const el = e.target as HTMLInputElement;
  const v = el.value.trim();
  if (!v) {
    el.value = s.name;
    return;
  }
  if (v === s.name) return;
  const ok = store.dispatch({ type: "patchCharacterRigSlice", sliceId: s.id, name: v });
  if (!ok) {
    el.value = s.name;
    alert("Could not save name.");
  }
}

function setRigMetaName(e: Event) {
  store.dispatch({ type: "setMetaName", name: (e.target as HTMLInputElement).value });
}

function readImageFileAsPayload(file: File): Promise<{ fileName: string; mimeType: string; dataBase64: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = fr.result as string;
      const m = s.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) {
        reject(new Error("Could not read image."));
        return;
      }
      let mime = m[1]!.trim().toLowerCase();
      const dataBase64 = m[2]!.replace(/\s/g, "");
      if (!mime || mime === "application/octet-stream") {
        mime = (file.type || mimeFromFileName(file.name) || "").toLowerCase();
      }
      resolve({ fileName: file.name, mimeType: mime, dataBase64 });
    };
    fr.onerror = () => reject(fr.error ?? new Error("Read failed"));
    fr.readAsDataURL(file);
  });
}

function addEmptySlot() {
  const before = slices.value.length;
  if (!store.dispatch({ type: "addCharacterRigEmptyPart" })) return;
  const next = project.value.characterRig?.slices;
  if (next && next.length > before) {
    store.selectCharacterRigSlice(next[next.length - 1]!.id);
  }
}

function triggerSheetImport() {
  sheetInput.value?.click();
}

function sheetThumbDataUrl(sh: CharacterRigSpriteSheetEntry): string {
  return `data:${sh.mimeType};base64,${sh.dataBase64}`;
}

function openSheetSlicePicker(sheetId: string) {
  let sid = selectedCharacterRigSliceId.value;
  if (!sid && slices.value.length > 0) {
    const last = slices.value[slices.value.length - 1]!;
    store.selectCharacterRigSlice(last.id);
    sid = last.id;
  }
  if (!sid) {
    alert("Create or select a part on the left first (sheet assignment needs an active slot).");
    return;
  }
  store.openSheetSliceModal(sheetId);
}

function removeSheet(sheetId: string) {
  store.dispatch({ type: "removeCharacterRigSpriteSheet", sheetId });
}

function addChildBone() {
  const bones = project.value.bones;
  const root = bones.find((b) => b.parentId === null);
  const sid = selectedBoneId.value;
  const parentId =
    sid && bones.some((b) => b.id === sid) ? sid : root?.id ?? null;
  if (parentId === null) return;
  const name = `Bone ${bones.length + 1}`;
  const nBefore = bones.length;
  if (
    !store.dispatch({
      type: "addBone",
      parentId,
      name,
      placeAtParentTip: placeNewBonesAtParentTip.value,
    })
  )
    return;
  const nb = project.value.bones;
  if (nb.length > nBefore) {
    const newId = nb[nb.length - 1]!.id;
    store.selectBone(newId);
    store.setPendingBonePlacement(newId);
  }
}

function patchSelectedBoneBind(field: "x" | "y" | "rotation" | "sx" | "sy", e: Event) {
  const id = selectedBoneId.value;
  if (!id) return;
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isNaN(n)) return;
  store.dispatch({ type: "setBindPose", boneId: id, partial: { [field]: n } });
}

function patchSelectedBoneLength(e: Event) {
  const id = selectedBoneId.value;
  if (!id) return;
  const n = Number((e.target as HTMLInputElement).value);
  if (Number.isNaN(n) || n < 0) return;
  store.dispatch({ type: "setBoneLength", boneId: id, length: n });
}

function snapSelectedToParentTip() {
  const id = selectedBoneId.value;
  if (!id) return;
  store.dispatch({ type: "snapBoneToParentTip", boneId: id });
}

function setSelectedFollowParentTip(e: Event) {
  const id = selectedBoneId.value;
  if (!id) return;
  const on = (e.target as HTMLInputElement).checked;
  store.dispatch({ type: "setBoneFollowParentTip", boneId: id, follow: on });
}

function renameSelectedBoneFromInspector(e: Event) {
  const bone = selectedBone.value;
  if (!bone) return;
  const el = e.target as HTMLInputElement;
  const v = el.value.trim();
  if (!v) {
    el.value = bone.name;
    return;
  }
  store.dispatch({ type: "renameBone", boneId: bone.id, name: v });
}

function onBoneNameChange(boneId: string, e: Event) {
  const el = e.target as HTMLInputElement;
  const previousName = project.value.bones.find((x) => x.id === boneId)?.name ?? "";
  const v = el.value.trim();
  if (!v) {
    el.value = previousName;
    return;
  }
  const ok = store.dispatch({ type: "renameBone", boneId, name: v });
  if (!ok) {
    el.value = previousName;
    alert("Could not save name.");
  }
}

async function onSheetFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  let okCount = 0;
  for (const f of files) {
    try {
      const payload = await readImageFileAsPayload(f);
      const mime = normalizeReferenceImageMime(payload.mimeType);
      if (!mime) continue;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("decode"));
        img.src = `data:${mime};base64,${payload.dataBase64}`;
      });
      const ok = store.dispatch({
        type: "addCharacterRigSpriteSheet",
        fileName: f.name,
        mimeType: mime,
        dataBase64: payload.dataBase64,
        pixelWidth: img.naturalWidth,
        pixelHeight: img.naturalHeight,
      });
      if (ok) okCount++;
    } catch {
      /* skip */
    }
  }
  if (files.length > 0 && okCount === 0) {
    alert("Could not add sprite sheet (PNG / JPEG / WebP).");
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="characterRigModalOpen" class="overlay" @click.self="close">
      <div class="dialog" role="dialog" aria-labelledby="crig-title">
        <header class="head">
          <h2 id="crig-title">Character Rig</h2>
          <div class="head-actions">
            <button type="button" class="ghost" @click="store.undo()">Undo</button>
            <button type="button" class="ghost" @click="store.redo()">Redo</button>
            <button type="button" class="close" title="Close (Esc)" @click="close">×</button>
          </div>
        </header>

        <div class="body">
          <section v-if="step !== 1" class="sprite-rail" aria-label="Sprites">
            <div class="rail-title">Sprites</div>
            <p class="muted rail-order-hint">
              Order = draw order: lower in the list draws later (on top). Drag ⋮⋮; drop on the row below to move, or use
              the bottom row to send to the end (topmost draw).
            </p>
            <div class="rail-table-wrap">
              <table v-if="slices.length" class="rail-table">
                <thead>
                  <tr>
                    <th class="rail-th-drag" title="Drag to reorder" aria-label="Reorder" />
                    <th>Sprite</th>
                    <th class="rail-th-side">Side</th>
                    <th class="rail-th-tools" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="s in slices"
                    :key="s.id"
                    class="rail-row"
                    :class="{
                      active: selectedCharacterRigSliceId === s.id,
                      'rail-drop-target': sliceDropHighlightId === s.id,
                    }"
                    @click="onSpriteRailRowClick(s.id)"
                    @dragover="onSliceRowDragOver(s.id, $event)"
                    @drop="onSliceRowDrop(s.id, $event)"
                    @dragend="onSliceRailDragEnd"
                  >
                    <td class="rail-drag" @click.stop>
                      <span
                        class="rail-drag-grip"
                        draggable="true"
                        title="Reorder part (draw order)"
                        aria-label="Reorder part"
                        @dragstart="onSliceGripDragStart(s.id, $event)"
                        @click.stop
                        >⋮⋮</span>
                    </td>
                    <td class="rail-name">
                      <input
                        class="rail-input rail-name-input"
                        type="text"
                        :value="s.name"
                        :title="'Name: ' + s.name"
                        @click.stop
                        @change="onSliceNameChange(s, $event)"
                      />
                      <span v-if="s.width <= 0 || s.height <= 0" class="dim"> (empty)</span>
                    </td>
                    <td class="rail-col-side">
                      <select
                        class="rail-select rail-select-side"
                        :value="s.side ?? 'front'"
                        title="Facing metadata (front / back)"
                        @click.stop
                        @change="
                          setSliceSide(s.id, ($event.target as HTMLSelectElement).value as 'front' | 'back')
                        "
                      >
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                      </select>
                    </td>
                    <td class="rail-tools" @click.stop>
                      <button
                        type="button"
                        class="rail-detail-btn"
                        title="Part details (name, side…)"
                        @click="openPartModal(s.id)"
                      >
                        …
                      </button>
                    </td>
                  </tr>
                  <tr
                    class="rail-drop-end"
                    :class="{ 'rail-drop-target': sliceDropHighlightId === 'end' }"
                    @dragover="onSliceTailDragOver($event)"
                    @drop="onSliceDropAppendEnd"
                    @dragend="onSliceRailDragEnd"
                  >
                    <td colspan="4" class="rail-drop-end-cell">Drop here → draw on top (end of list)</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="muted rail-empty">No sprites yet — use + New to add a part slot.</p>
            </div>
            <button type="button" class="rail-new" @click="addEmptySlot">+ New</button>
          </section>

          <section v-else class="sprite-rail bone-rail" aria-label="Bone hierarchy">
            <div class="rail-title">Bones</div>
            <p class="muted rail-bone-intro">
              Indent = child of the row above. <strong>+ New</strong> adds a child of the <strong>selected</strong> bone
              (otherwise under root). New bones appear orange — <strong>click</strong> in the view to place, then drag.
            </p>
            <div class="rail-table-wrap">
              <ul v-if="bonesHierarchy.length" class="bone-tree">
                <li
                  v-for="b in bonesHierarchy"
                  :key="b.id"
                  class="bone-tree-row"
                  :class="{ active: selectedBoneId === b.id }"
                  :style="{ paddingLeft: `${0.35 + b.depth * 0.65}rem` }"
                  @click="store.selectBone(b.id)"
                >
                  <span v-if="b.depth > 0" class="bone-tree-branch" aria-hidden="true">└ </span>
                  <input
                    class="rail-input bone-tree-name"
                    type="text"
                    :value="b.name"
                    :title="b.name"
                    @click.stop
                    @change="onBoneNameChange(b.id, $event)"
                  />
                </li>
              </ul>
              <p v-else class="muted rail-empty">No bones.</p>
            </div>
            <button type="button" class="rail-new rail-new-bone" @click="addChildBone">+ New</button>
          </section>

          <nav class="nav" aria-label="Workflow">
            <button
              v-for="(s, i) in steps"
              :key="s.id"
              type="button"
              class="nav-btn"
              :class="{ active: step === i, 'nav-locked': (i === 3 || i === 4) && !rigBindingsComplete }"
              :disabled="(i === 3 || i === 4) && !rigBindingsComplete"
              :title="
                (i === 3 || i === 4) && !rigBindingsComplete
                  ? 'In the “Bind” step, assign every part with pixels to a bone first.'
                  : undefined
              "
              @click="goToRigStep(i)"
            >
              {{ i + 1 }}. {{ s.title }}
            </button>
          </nav>

          <div class="main-col">
            <div class="rig-viewport-cap" role="status">
              <span class="rig-camera-label">Viewport</span>
              <div class="rig-camera-modes" aria-label="Camera mode (Smack-style)">
                <button
                  type="button"
                  class="cam-btn"
                  :class="{ active: rigCameraViewKind === '2d' }"
                  title="Orthographic from front"
                  @click="store.setRigCameraViewKind('2d')"
                >
                  2D
                </button>
                <button
                  type="button"
                  class="cam-btn"
                  :class="{ active: rigCameraViewKind === '2.5d' }"
                  title="Perspective, limited tilt"
                  @click="store.setRigCameraViewKind('2.5d')"
                >
                  2.5D
                </button>
                <button
                  type="button"
                  class="cam-btn"
                  :class="{ active: rigCameraViewKind === '3d' }"
                  title="Full orbit camera; depth as extrusion"
                  @click="store.setRigCameraViewKind('3d')"
                >
                  3D
                </button>
              </div>
              <span class="muted rig-camera-cap"
                >WebGL · parts/bones · depth/extrusion visible in 3D mode</span
              >
            </div>
            <div class="viewport-wrap">
              <CharacterRigThreeViewport />
              <div class="viewport-foot">
                <label class="rig-name-label"
                  >Name:
                  <input
                    class="rig-name-input"
                    type="text"
                    :value="project.meta.name"
                    @change="setRigMetaName"
                  />
                </label>
              </div>
            </div>
            <div class="step-scroll">
              <p class="hint">{{ steps[step]?.hint }}</p>

              <div v-show="step === 0" class="panel">
                <p class="muted">
                  Create <strong>parts</strong> on the left; load <strong>sprite sheets</strong> on the right; click a
                  sheet and pick a region in the modal (click or marquee). Select the target part in the left list first.
                  <strong>Move:</strong> drag the part in the viewport. <strong>Brush / Fill / Eraser:</strong> below —
                  edit front or back layer; copy/mirror ops like Smack.
                </p>
                <SpriteSliceEditPanel />
              </div>

              <div v-show="step === 1" class="panel">
                <p class="muted">
                  Hierarchy and <strong>+ New</strong> on the left. Place a new bone with a <strong>click</strong> in the
                  viewport, then drag the joint. Right: bind values as in the inspector.
                </p>
                <p class="muted roadmap-hint">
                  <strong>Length:</strong> drag the handle or <strong>Shift+joint</strong>; <strong>Esc</strong> cancels
                  preview, release commits.
                  <strong>Chain:</strong> at tip / follow (right). Viewport: <strong>WebGL</strong> (pick 2D / 2.5D / 3D
                  above).
                </p>
                <p class="muted roadmap-hint">
                  <strong>In front / behind in the rig:</strong> use <strong>3D bind pose</strong> on the right (Bind Z,
                  depth offset) — not in “3D Settings”.
                </p>
              </div>

              <div v-show="step === 2" class="panel">
                <p v-if="!rigBindingsComplete && slices.length" class="bind-gate-warn" role="status">
                  When <strong>every</strong> part with pixels has a bone, you can <strong>generate rig meshes</strong>
                  (below) and use <strong>3D Settings</strong> and <strong>Preview</strong>.
                </p>
                <p v-if="slices.length" class="muted bind-hint">
                  In the viewport: click a <strong>bone</strong> first (it sits above large sprite quads) · clicking a
                  part selects its row · assign the bone in the dropdown here — parts are <strong>not</strong> draggable in
                  this step.
                </p>
                <p v-if="!slices.length" class="muted">Add sprites on the left (+ New) and assign pixels from sheets if needed.</p>
                <table v-else class="bind-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Bone</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in slices" :key="s.id">
                      <td>{{ s.name }}</td>
                      <td>
                        <select
                          :value="bindingBoneId(s.id)"
                          @change="setBinding(s.id, ($event.target as HTMLSelectElement).value)"
                        >
                          <option value="">—</option>
                          <option v-for="b in bonesSorted" :key="b.id" :value="b.id">{{ b.name }}</option>
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div v-if="slices.length" class="meshing-block meshing-on-bind">
                  <h4 class="meshing-title">Generate rig meshes (3D geometry)</h4>
                  <p class="muted meshing-copy">
                    Creates <code>rig_slice_…</code> meshes for each bound part. If depth is unset, sync applies a small
                    default extrusion (not paper-thin). Then refine in <strong>3D Settings</strong> (maps, max depth).
                  </p>
                  <button
                    type="button"
                    class="primary meshing-btn"
                    :disabled="!rigBindingsComplete"
                    @click="syncMeshingFromRig"
                  >
                    Generate / update meshes from rig
                  </button>
                  <p class="muted meshing-count">
                    Rig meshes in project: <strong>{{ rigGeneratedMeshCount }}</strong>
                    <span v-if="rigGeneratedMeshCount > 0">(IDs <code>rig_slice_…</code>)</span>
                  </p>
                </div>
              </div>

              <div v-show="step === 3" class="panel panel-3d-smack">
                <p v-if="meshSyncFeedback" class="mesh-sync-feedback" role="status">{{ meshSyncFeedback }}</p>
                <p v-if="!slices.length" class="muted">No parts — add slots on the left.</p>
                <template v-else>
                  <p class="muted depth-intro">
                    Smack-style: <strong>one part</strong> (select on the left) — viewport shows only that part.
                    <strong>Max depth</strong> = mesh extrusion; <strong>Regenerate map</strong> = heuristic grayscale map
                    from the sprite. Bone in front/behind: <strong>Bones</strong> step.
                  </p>
                  <p v-if="!selectedSliceFor3d" class="muted smack-pick-hint">
                    Select a part with pixels on the left.
                  </p>
                  <p
                    v-else-if="selectedSliceFor3d.width <= 0 || selectedSliceFor3d.height <= 0"
                    class="muted smack-pick-hint"
                  >
                    This slot has no pixels yet — assign a sprite first.
                  </p>
                  <template v-else>
                    <h3 class="smack-part-title">{{ selectedSliceFor3d.name }}</h3>
                    <div class="smack-depth-columns">
                      <section class="smack-depth-col" aria-labelledby="smack-front-h">
                        <h4 id="smack-front-h" class="smack-col-title">Front</h4>
                        <label class="smack-depth-num"
                          >Max depth
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            class="smack-num-inp"
                            :value="depthFor(selectedSliceFor3d.id).maxDepthFront"
                            @change="
                              setDepth(
                                selectedSliceFor3d.id,
                                Number(($event.target as HTMLInputElement).value),
                                depthFor(selectedSliceFor3d.id).maxDepthBack,
                                depthFor(selectedSliceFor3d.id).syncBackWithFront,
                              )
                            "
                        /></label>
                        <button
                          type="button"
                          class="smack-thumb-btn"
                          :title="'Edit depth map (front)'"
                          @click="openDepthTextureModal(selectedSliceFor3d.id, 'front')"
                        >
                          <img
                            v-if="depthTextureThumbDataUrl(selectedSliceFor3d.id, 'front')"
                            class="smack-depth-thumb"
                            :src="depthTextureThumbDataUrl(selectedSliceFor3d.id, 'front')"
                            alt=""
                          />
                          <span v-else class="smack-thumb-ph">No map — click to paint</span>
                        </button>
                        <div class="smack-col-actions">
                          <button
                            type="button"
                            class="mini smack-action"
                            @click="openDepthTextureModal(selectedSliceFor3d.id, 'front')"
                          >
                            Edit…
                          </button>
                          <button
                            type="button"
                            class="mini smack-action"
                            :disabled="depthRegenBusy !== null"
                            @click="regenerateDepthTexture('front')"
                          >
                            {{ depthRegenBusy === 'front' ? '…' : 'Regenerate' }}
                          </button>
                        </div>
                        <button type="button" class="smack-default-btn" @click="setDefaultDepthFront">
                          Default depth
                        </button>
                      </section>
                      <section class="smack-depth-col" aria-labelledby="smack-back-h">
                        <h4 id="smack-back-h" class="smack-col-title">Back</h4>
                        <label class="smack-depth-num"
                          >Max depth
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            class="smack-num-inp"
                            :disabled="depthFor(selectedSliceFor3d.id).syncBackWithFront"
                            :value="depthFor(selectedSliceFor3d.id).maxDepthBack"
                            @change="
                              setDepth(
                                selectedSliceFor3d.id,
                                depthFor(selectedSliceFor3d.id).maxDepthFront,
                                Number(($event.target as HTMLInputElement).value),
                                depthFor(selectedSliceFor3d.id).syncBackWithFront,
                              )
                            "
                        /></label>
                        <label class="smack-sync-row">
                          <input
                            type="checkbox"
                            :checked="depthFor(selectedSliceFor3d.id).syncBackWithFront"
                            @change="
                              setDepth(
                                selectedSliceFor3d.id,
                                depthFor(selectedSliceFor3d.id).maxDepthFront,
                                depthFor(selectedSliceFor3d.id).maxDepthBack,
                                ($event.target as HTMLInputElement).checked,
                              )
                            "
                          />
                          Sync front
                        </label>
                        <button
                          type="button"
                          class="smack-thumb-btn"
                          :title="'Edit depth map (back)'"
                          @click="openDepthTextureModal(selectedSliceFor3d.id, 'back')"
                        >
                          <img
                            v-if="depthTextureThumbDataUrl(selectedSliceFor3d.id, 'back')"
                            class="smack-depth-thumb"
                            :src="depthTextureThumbDataUrl(selectedSliceFor3d.id, 'back')"
                            alt=""
                          />
                          <span v-else class="smack-thumb-ph">No map — click to paint</span>
                        </button>
                        <div class="smack-col-actions">
                          <button
                            type="button"
                            class="mini smack-action"
                            @click="openDepthTextureModal(selectedSliceFor3d.id, 'back')"
                          >
                            Edit…
                          </button>
                          <button
                            type="button"
                            class="mini smack-action"
                            :disabled="depthRegenBusy !== null"
                            @click="regenerateDepthTexture('back')"
                          >
                            {{ depthRegenBusy === 'back' ? '…' : 'Regenerate' }}
                          </button>
                        </div>
                        <button type="button" class="smack-default-btn" @click="setDefaultDepthBack">
                          Default depth
                        </button>
                      </section>
                    </div>
                  </template>
                </template>
              </div>

              <div v-show="step === 4" class="panel">
                <p>
                  <strong>{{ bindings.length }}</strong> binding(s), <strong>{{ slices.length }}</strong> part(s).
                  Stored under <code>characterRig</code>.
                </p>
                <ul class="summary">
                  <li v-for="s in slices" :key="s.id">
                    {{ s.name }} →
                    {{ project.bones.find((b) => b.id === bindingBoneId(s.id))?.name ?? "—" }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <aside class="tools" aria-label="Tools">
            <div v-if="showSheetColumn" class="tools-block tools-block-sheets">
              <h3 class="tools-title">Sprite sheets</h3>
              <p class="tools-hint muted">
                Raw textures only. Click opens the picker for the <strong>selected part on the left</strong>.
              </p>
              <button type="button" class="primary tools-import" @click="triggerSheetImport">
                Add sprite sheet…
              </button>
              <input
                ref="sheetInput"
                type="file"
                class="hidden"
                multiple
                :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
                @change="onSheetFiles"
              />
              <ul v-if="spriteSheets.length" class="tools-list">
                <li
                  v-for="sh in spriteSheets"
                  :key="sh.id"
                  class="tools-item tools-sheet"
                  @click="openSheetSlicePicker(sh.id)"
                >
                  <img class="tools-thumb" :src="sheetThumbDataUrl(sh)" alt="" />
                  <span class="tools-name" :title="sh.fileName">{{ sh.fileName }}</span>
                  <button type="button" class="tools-remove" title="Remove sheet" @click.stop="removeSheet(sh.id)">
                    ×
                  </button>
                </li>
              </ul>
              <p v-else class="muted tools-empty">No sheets yet — add PNG / JPEG / WebP.</p>
            </div>

            <div v-if="step === 1" class="tools-block bone-settings-aside">
              <h3 class="bone-settings-title">
                Bone Settings<span v-if="selectedBone" class="bone-settings-name">: {{ selectedBone.name }}</span>
              </h3>
              <p v-if="!selectedBone" class="muted bone-settings-sub">No bone selected</p>
              <p class="muted bone-settings-note">
                <strong>2D bind pose</strong>, <strong>length</strong>, and <strong>3D bind pose</strong> (Z / depth offset
                / tilt / spin) — same as the inspector; set in-front/behind here.
              </p>
              <template v-if="selectedBone">
                <label class="bs-lbl"
                  >Name
                  <input
                    class="bs-inp"
                    type="text"
                    :value="selectedBone.name"
                    @change="renameSelectedBoneFromInspector($event)"
                  />
                </label>
                <label class="bs-lbl"
                  >X (Bind)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.1"
                    :value="selectedBone.bindPose.x"
                    @change="patchSelectedBoneBind('x', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Y (Bind)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.1"
                    :value="selectedBone.bindPose.y"
                    @change="patchSelectedBoneBind('y', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Rotation (rad)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.01"
                    :value="selectedBone.bindPose.rotation"
                    @change="patchSelectedBoneBind('rotation', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Length (px)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.5"
                    min="0"
                    :value="selectedBone.length"
                    @change="patchSelectedBoneLength($event)"
                  />
                </label>
                <p v-if="!selectedBone.parentId" class="muted bs-root-length-hint">
                  Root: often <strong>length 0</strong> (pivot only). Drag the handle or <strong>Shift+joint</strong>;
                  <strong>Esc</strong> cancels length preview. Drag follows the bone axis (bind-pose plane).
                </p>
                <label class="bs-lbl"
                  >Scale X
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.05"
                    :value="selectedBone.bindPose.sx"
                    @change="patchSelectedBoneBind('sx', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Scale Y
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.05"
                    :value="selectedBone.bindPose.sy"
                    @change="patchSelectedBoneBind('sy', $event)"
                  />
                </label>
                <h4 class="bs-subtitle">3D bind pose (in front / behind)</h4>
                <p class="muted bs-3d-note">
                  Bind Z and depth offset control <strong>skeleton depth</strong> (which bone sits closer to the camera).
                  Tilt / spin rotate the bone in space. Details: <code>docs/adr/0011-editor-bone-3d-bind-pose.md</code>.
                </p>
                <label class="bs-lbl"
                  >Bind Z
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.1"
                    :value="rigModalBindBone3d('z')"
                    @change="patchSelectedBindBone3d('z', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Depth offset
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.1"
                    :value="rigModalBindBone3d('depthOffset')"
                    @change="patchSelectedBindBone3d('depthOffset', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Tilt (rad)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.01"
                    :value="rigModalBindBone3d('tilt')"
                    @change="patchSelectedBindBone3d('tilt', $event)"
                  />
                </label>
                <label class="bs-lbl"
                  >Spin (rad)
                  <input
                    class="bs-inp bs-num"
                    type="number"
                    step="0.01"
                    :value="rigModalBindBone3d('spin')"
                    @change="patchSelectedBindBone3d('spin', $event)"
                  />
                </label>
                <div v-if="selectedBone.parentId" class="bs-hybrid">
                  <p class="muted bs-hybrid-title">Chain / tip</p>
                  <label class="bs-rowchk">
                    <input
                      type="checkbox"
                      :checked="placeNewBonesAtParentTip"
                      @change="store.setPlaceNewBonesAtParentTip(($event.target as HTMLInputElement).checked)"
                    />
                    + New at parent tip (when length > 0)
                  </label>
                  <button type="button" class="bs-mini" @click="snapSelectedToParentTip">Snap to parent tip</button>
                  <label class="bs-rowchk">
                    <input
                      type="checkbox"
                      :checked="!!selectedBone.followParentTip"
                      @change="setSelectedFollowParentTip($event)"
                    />
                    Follow parent tip
                  </label>
                </div>
                <p v-if="selectedBone.parentId && selectedBoneParentSpan !== null" class="muted bs-chain">
                  Distance parent joint → this joint: <strong>{{ selectedBoneParentSpan.toFixed(1) }}</strong>
                  <span class="dim"> (from bind X/Y; independent of length)</span>
                </p>
                <p v-else-if="selectedBone" class="muted bs-chain">
                  <span class="dim">Root — no parent span.</span>
                </p>
              </template>
            </div>

            <div v-if="showBoneColumn" class="tools-block tools-block-bones" :class="{ 'tools-divider': showSheetColumn }">
              <h3 class="tools-title tools-title-bones">Bones (overview)</h3>
              <p class="tools-hint muted">
                Click = select. “Add child” matches <strong>+ New</strong> on the left (child of the selected bone).
              </p>
              <button type="button" class="primary bone-add-btn" @click="addChildBone">Add child</button>
              <div class="bone-list-wrap">
                <ul class="bone-rail-list">
                  <li
                    v-for="b in bonesHierarchy"
                    :key="b.id"
                    class="bone-rail-item"
                    :class="{ active: selectedBoneId === b.id }"
                    :style="{ paddingLeft: `${0.35 + b.depth * 0.55}rem` }"
                    @click="store.selectBone(b.id)"
                  >
                    <span class="bone-rail-name">{{ b.name }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </div>

        <footer class="foot">
          <span class="muted">
            Changes apply immediately (Undo/Redo). “Done” syncs rig meshes — only when every part with pixels is bound.
          </span>
          <button
            type="button"
            class="primary"
            :disabled="!rigBindingsComplete"
            :title="!rigBindingsComplete ? 'Assign every part with pixels to a bone in the “Bind” step first.' : undefined"
            @click="finishRigAndClose"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="characterRigModalOpen && spriteModalSliceId && partModalSlice"
      class="part-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="part-modal-title"
      @click.self="closePartModal"
    >
      <div class="part-dialog" @click.stop>
        <header class="part-head">
          <h3 id="part-modal-title">Sprite</h3>
          <button type="button" class="part-close" title="Close" @click="closePartModal">×</button>
        </header>
        <div class="part-body">
          <div class="part-preview-wrap">
            <img
              v-if="thumbDataUrl(partModalSlice)"
              class="part-preview-img"
              :src="thumbDataUrl(partModalSlice)"
              alt=""
            />
            <div v-else class="part-preview-ph">No embedded image</div>
          </div>
          <label class="part-field"
            >Name
            <input v-model="partEditName" class="part-input" type="text" />
          </label>
          <label class="part-field"
            >Side
            <select v-model="partEditSide" class="part-input">
              <option value="front">Front</option>
              <option value="back">Back</option>
            </select>
          </label>
        </div>
        <footer class="part-foot">
          <button type="button" class="ghost" @click="closePartModal">Close</button>
          <button type="button" class="primary" @click="applyPartModal">Apply</button>
        </footer>
      </div>
    </div>
  </Teleport>

  <DepthTextureEditorModal
    :open="depthTextureModalOpen"
    :slice-id="depthTextureModalSliceId"
    :side="depthTextureModalSide"
    @close="closeDepthTextureModal"
  />
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.78);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 0.35rem;
}
.dialog {
  width: 100%;
  max-width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #25262b;
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid #3b3f48;
  flex-shrink: 0;
}
.head h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}
.head-actions {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.close {
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  border: 1px solid #884444;
  background: #4a2020;
  color: #fecaca;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
}
.body {
  display: grid;
  /* Center column min ~40% / 320px — avoids a paper-thin viewport; right column stays narrow */
  grid-template-columns:
    minmax(180px, 240px) minmax(112px, 152px) minmax(320px, 1fr) minmax(180px, 280px);
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.sprite-rail {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem 0.5rem;
  border-right: 1px solid #3b3f48;
  background: #1a1b20;
  min-height: 0;
  overflow: hidden;
}
.rail-title {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
}
.rail-order-hint {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.35;
}
.rail-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rail-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.75rem;
}
.rail-table th,
.rail-table td {
  border: 1px solid #3b3f48;
  padding: 0.25rem 0.3rem;
  text-align: left;
  vertical-align: middle;
}
.rail-table th {
  background: #25262b;
  color: #9ca3af;
  font-weight: 600;
}
.rail-row {
  cursor: pointer;
}
.rail-row:hover {
  background: #2a2d35;
}
.rail-row.active {
  outline: 1px solid #4f6ab8;
  background: #2a3150;
}
.rail-row.rail-drop-target {
  outline: 1px dashed #93c5fd;
  background: #1e2a3d;
}
.rail-th-drag {
  width: 1.5rem;
  padding: 0.15rem !important;
}
.rail-th-side {
  width: 5.5rem;
  min-width: 5.5rem;
  white-space: nowrap;
}
.rail-col-side {
  width: 5.5rem;
  min-width: 5.5rem;
  max-width: 6.5rem;
  vertical-align: middle;
  box-sizing: border-box;
}
.rail-select-side {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.rail-drag {
  width: 1.5rem;
  text-align: center;
  vertical-align: middle;
  padding: 0.1rem !important;
}
.rail-drag-grip {
  display: inline-block;
  cursor: grab;
  user-select: none;
  color: #9ca3af;
  font-size: 0.65rem;
  line-height: 1;
  letter-spacing: -0.08em;
  opacity: 0.75;
}
.rail-drag-grip:hover {
  opacity: 1;
  color: #e5e7eb;
}
.rail-drag-grip:active {
  cursor: grabbing;
}
.rail-drop-end .rail-drop-end-cell {
  padding: 0.2rem 0.35rem;
  font-size: 0.65rem;
  color: #6b7280;
  text-align: center;
  border-style: dashed;
  background: #1f2024;
}
.rail-drop-end.rail-drop-target .rail-drop-end-cell {
  color: #93c5fd;
  border-color: #60a5fa;
  background: #1a2433;
}
.rail-th-tools {
  width: 1.75rem;
}
.rail-tools {
  padding: 0.1rem;
  text-align: center;
  vertical-align: middle;
}
.rail-detail-btn {
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #2e3138;
  color: #cbd5e1;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
}
.rail-detail-btn:hover {
  border-color: #6b7280;
  color: #fff;
}
.rail-name {
  max-width: 6.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e5e7eb;
}
.rail-input {
  width: 100%;
  min-width: 0;
  padding: 0.15rem 0.25rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
  font-size: 0.72rem;
}
.rail-select {
  width: 100%;
  padding: 0.15rem 0.2rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
  font-size: 0.72rem;
}
.rail-empty {
  font-size: 0.78rem;
  padding: 0.25rem 0;
  line-height: 1.35;
}
.rail-new {
  flex-shrink: 0;
  padding: 0.4rem;
  border-radius: 6px;
  border: 1px solid #3d6b4a;
  background: #1e3a2f;
  color: #86efac;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.rail-new:hover {
  background: #274a3c;
}
.bone-rail .rail-bone-intro {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  line-height: 1.35;
}
.bone-tree {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.75rem;
}
.bone-tree-row {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.22rem 0.25rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
}
.bone-tree-row:hover {
  background: #2a2d35;
}
.bone-tree-row.active {
  background: #2a3150;
  border-color: #4f6ab8;
}
.bone-tree-branch {
  color: #6b7280;
  flex-shrink: 0;
  font-size: 0.7rem;
}
.bone-tree-name {
  flex: 1;
  min-width: 0;
}
.rail-new-bone {
  border-color: #4f5a8a;
  background: #252a45;
  color: #a5b4fc;
}
.rail-new-bone:hover {
  background: #2e3555;
}
.bone-settings-aside {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.15rem 0;
}
.bone-settings-title {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #9ca3af;
}
.bone-settings-name {
  font-weight: 500;
  color: #a5b4fc;
  text-transform: none;
  letter-spacing: normal;
}
.bone-settings-sub {
  margin: 0 0 0.15rem;
  font-size: 0.78rem;
}
.bone-settings-note {
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  line-height: 1.35;
}
.bs-subtitle {
  margin: 0.55rem 0 0.2rem;
  font-size: 0.74rem;
  font-weight: 600;
  color: #c7d2fe;
  letter-spacing: 0.02em;
}
.bs-3d-note {
  margin: 0 0 0.45rem;
  font-size: 0.65rem;
  line-height: 1.4;
  color: #6b7280;
}
.bs-lbl {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  font-size: 0.72rem;
  color: #9ca3af;
}
.bs-inp {
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #18191c;
  color: #e5e7eb;
  font-size: 0.78rem;
}
.bs-inp.bs-num {
  max-width: 100%;
}
.bs-chain {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  line-height: 1.35;
}
.bs-hybrid {
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.bs-hybrid-title {
  margin: 0;
  font-size: 0.68rem;
}
.bs-rowchk {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: #9ca3af;
  cursor: pointer;
}
.bs-mini {
  align-self: flex-start;
  padding: 0.25rem 0.5rem;
  font-size: 0.72rem;
  border-radius: 4px;
  border: 1px solid #555;
  background: #25262b;
  color: #e5e7eb;
  cursor: pointer;
}
.bs-mini:hover {
  border-color: #6366f1;
}
.bs-root-length-hint {
  margin: 0.2rem 0 0.35rem;
  font-size: 0.68rem;
  line-height: 1.35;
}
.roadmap-hint {
  margin-top: 0.65rem;
  font-size: 0.78rem;
  line-height: 1.45;
}
.roadmap-hint code {
  font-size: 0.85em;
  color: #a5b4fc;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  border-right: 1px solid #3b3f48;
  background: #1e1f24;
  overflow: auto;
}
.nav-btn {
  text-align: left;
  padding: 0.45rem 0.5rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #d1d5db;
  cursor: pointer;
  font-size: 0.82rem;
}
.nav-btn:hover {
  background: #2e3138;
}
.nav-btn.active {
  border-color: #4f6ab8;
  background: #2a3150;
  color: #a5b4fc;
}
.nav-btn:disabled,
.nav-btn.nav-locked {
  opacity: 0.45;
  cursor: not-allowed;
}
.nav-btn:disabled:hover,
.nav-btn.nav-locked:hover {
  background: transparent;
}
.bind-gate-warn {
  margin: 0 0 0.65rem;
  padding: 0.5rem 0.55rem;
  font-size: 0.82rem;
  line-height: 1.35;
  color: #fcd34d;
  background: rgba(120, 53, 15, 0.35);
  border-radius: 6px;
  border: 1px solid rgba(251, 191, 36, 0.35);
}
.main-col {
  display: flex;
  flex-direction: column;
  min-width: min(100%, 320px);
  min-height: 0;
}
.rig-viewport-cap {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.4rem 0.65rem;
  border-bottom: 1px solid #3b3f48;
  background: #1e1f24;
}
.rig-camera-label {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9ca3af;
}
.rig-camera-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}
.cam-btn {
  padding: 0.22rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid #4b5563;
  background: #27272f;
  color: #d1d5db;
  cursor: pointer;
}
.cam-btn:hover {
  background: #32323c;
}
.cam-btn.active {
  background: #2563eb;
  border-color: #3b82f6;
  color: #fff;
}
.rig-camera-cap {
  font-size: 0.65rem;
  flex: 1 1 140px;
  min-width: 0;
  line-height: 1.3;
}
.viewport-wrap {
  flex: 1 1 72%;
  min-height: 280px;
  display: flex;
  flex-direction: column;
  position: relative;
  border-bottom: 1px solid #3b3f48;
  background: #1a1b1e;
}
.viewport-wrap :deep(.viewport) {
  flex: 1;
  min-height: 0;
}
.viewport-foot {
  flex-shrink: 0;
  padding: 0.35rem 0.75rem;
  border-top: 1px solid #3b3f48;
  background: #1e1f24;
}
.rig-name-label {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #9ca3af;
}
.rig-name-input {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: #e5e7eb;
}
.step-scroll {
  flex: 0 1 28%;
  min-height: 88px;
  max-height: min(220px, 32vh);
  overflow: auto;
  padding: 0.75rem 1rem;
}
.future-note {
  margin-top: 0.65rem;
  font-size: 0.8rem;
  font-style: italic;
}
.rail-name-input {
  max-width: 7rem;
  font-weight: 500;
  color: #e5e7eb;
}
.tools {
  border-left: 1px solid #3b3f48;
  background: #1e1f24;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  min-width: 0;
  max-width: 280px;
  overflow: hidden;
}
.tools-block-sheets {
  flex: 0 1 auto;
  min-height: 0;
  max-height: 48%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tools-block-bones {
  flex: 1 1 40%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.tools-block-bones:not(.tools-divider) {
  flex: 1 1 auto;
}
.tools-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.tools-hint {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
}
.tools-import {
  width: auto;
  max-width: 100%;
  align-self: flex-start;
}
.tools-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.82rem;
}
.tools-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid #2e3138;
  cursor: pointer;
  border-radius: 4px;
}
.tools-item:hover {
  background: #2a2d35;
}
.tools-item.active {
  background: #2a3150;
  outline: 1px solid #4f6ab8;
}
.tools-thumb {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 4px;
  background: #111;
  flex-shrink: 0;
  border: 1px solid #444;
}
.tools-thumb-ph {
  background: repeating-linear-gradient(45deg, #2a2a2e, #2a2a2e 4px, #333 4px, #333 8px);
}
.tools-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #d1d5db;
}
.tools-remove {
  flex-shrink: 0;
  padding: 0.1rem 0.35rem;
  line-height: 1;
  border-radius: 4px;
  border: 1px solid #555;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}
.tools-remove:hover {
  background: #3f2020;
  border-color: #884444;
  color: #fecaca;
}
.tools-empty {
  font-size: 0.82rem;
  line-height: 1.4;
}
.tools-title-bones {
  margin-top: 0;
}
.tools-divider {
  margin-top: 0.35rem;
  padding-top: 0.65rem;
  border-top: 1px solid #3b3f48;
}
.bone-add-btn {
  width: auto;
  max-width: 100%;
  align-self: flex-start;
  margin-bottom: 0.35rem;
}
.bone-list-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  margin-top: 0.25rem;
}
.bone-rail-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.78rem;
}
.bone-rail-item {
  padding: 0.28rem 0.35rem;
  border-radius: 4px;
  cursor: pointer;
  color: #d1d5db;
  border: 1px solid transparent;
}
.bone-rail-item:hover {
  background: #2a2d35;
}
.bone-rail-item.active {
  background: #2a3150;
  border-color: #4f6ab8;
  color: #a5b4fc;
}
.bone-rail-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #9ca3af;
}
.panel {
  font-size: 0.9rem;
}
.muted {
  color: #6b7280;
  font-size: 0.85rem;
}
.dim {
  color: #6b7280;
  font-size: 0.8rem;
}
.bone-list {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
}
.bind-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.bind-table th,
.bind-table td {
  border: 1px solid #3b3f48;
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.bind-table select {
  width: 100%;
  padding: 0.25rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
}
.meshing-block {
  margin-bottom: 1rem;
  padding: 0.75rem 0.85rem;
  border-radius: 8px;
  border: 1px solid #3b3f48;
  background: rgba(30, 31, 36, 0.95);
}
.meshing-on-bind {
  margin-top: 0.85rem;
}
.depth-intro {
  margin: 0 0 0.65rem;
  font-size: 0.82rem;
  line-height: 1.45;
}
.panel-3d-smack {
  min-height: 0;
}
.smack-pick-hint {
  margin: 0.35rem 0 0.75rem;
  font-size: 0.82rem;
}
.smack-part-title {
  margin: 0 0 0.65rem;
  font-size: 1rem;
  font-weight: 600;
  color: #e5e7eb;
}
.smack-depth-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: start;
}
@media (max-width: 720px) {
  .smack-depth-columns {
    grid-template-columns: 1fr;
  }
}
.smack-depth-col {
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #3b3f48;
  background: rgba(22, 24, 30, 0.92);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.smack-col-title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #a5b4fc;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.smack-depth-num {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.78rem;
  color: #9ca3af;
}
.smack-num-inp {
  max-width: 6rem;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #18191c;
  color: #e5e7eb;
}
.smack-thumb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 96px;
  padding: 0.35rem;
  border-radius: 6px;
  border: 1px solid #4b5563;
  background: #0f1012;
  cursor: pointer;
}
.smack-thumb-btn:hover {
  border-color: #6366f1;
}
.smack-depth-thumb {
  max-width: 100%;
  max-height: 120px;
  image-rendering: pixelated;
  object-fit: contain;
}
.smack-thumb-ph {
  font-size: 0.72rem;
  color: #6b7280;
  text-align: center;
  padding: 0.5rem;
}
.smack-col-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.smack-action {
  flex: 1 1 auto;
  min-width: 0;
}
.smack-default-btn {
  align-self: flex-start;
  margin-top: 0.15rem;
  padding: 0.28rem 0.55rem;
  font-size: 0.74rem;
  border-radius: 4px;
  border: 1px solid #555;
  background: #25262b;
  color: #d1d5db;
  cursor: pointer;
}
.smack-default-btn:hover {
  border-color: #818cf8;
}
.smack-sync-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.76rem;
  color: #9ca3af;
  cursor: pointer;
}
.meshing-title {
  margin: 0 0 0.35rem;
  font-size: 0.92rem;
  font-weight: 600;
}
.meshing-copy {
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  line-height: 1.45;
}
.meshing-btn {
  margin-bottom: 0.5rem;
}
.meshing-btn:focus-visible {
  outline: 2px solid rgba(129, 140, 248, 0.55);
  outline-offset: 2px;
}
.meshing-btn:focus:not(:focus-visible) {
  outline: none;
}
.mesh-sync-feedback {
  margin: 0 0 0.5rem;
  padding: 0.45rem 0.55rem;
  font-size: 0.78rem;
  line-height: 1.4;
  color: #a7f3d0;
  background: rgba(6, 78, 59, 0.35);
  border: 1px solid rgba(52, 211, 153, 0.35);
  border-radius: 6px;
}
.meshing-count {
  margin: 0;
  font-size: 0.72rem;
}
.depth-row {
  display: grid;
  grid-template-columns: 1fr auto repeat(3, auto);
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.82rem;
}
.depth-label {
  font-weight: 500;
}
.depth-tools {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
button.mini.depth-btn {
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  background: #1f2430;
  border: 1px solid #3a4253;
  color: #cbd5e1;
  font-size: 0.74rem;
}
.mini {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #9ca3af;
}
.mini input[type="number"] {
  width: 4.5rem;
  padding: 0.2rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: inherit;
}
.mini.chk {
  flex-direction: row;
  align-items: center;
  gap: 0.35rem;
}
.summary {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
  color: #d1d5db;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid #3b3f48;
  flex-shrink: 0;
}
button {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  color: inherit;
  cursor: pointer;
}
button.primary {
  background: #3730a3;
  border-color: #4c4e9e;
  color: #eef;
}
button.ghost {
  border-color: #555;
  color: #9ca3af;
  background: transparent;
}
.hidden {
  display: none;
}
code {
  font-size: 0.8em;
  color: #a5b4fc;
}

.part-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.part-dialog {
  width: min(480px, 100%);
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: #2a2b31;
  border: 1px solid #555;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}
.part-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #444;
}
.part-head h3 {
  margin: 0;
  font-size: 1rem;
}
.part-close {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.part-body {
  padding: 0.75rem 1rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.part-preview-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 160px;
  background: #fff;
  border-radius: 6px;
  padding: 0.5rem;
}
.part-preview-img {
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
  image-rendering: pixelated;
}
.part-preview-ph {
  color: #666;
  font-size: 0.85rem;
}
.part-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.82rem;
  color: #9ca3af;
}
.part-input {
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #444;
  background: #1a1b1e;
  color: #e5e7eb;
}
.part-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #444;
}
</style>
