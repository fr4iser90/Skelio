<script setup lang="ts">
import {
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
  RIG_SLICE_MESH_ID_PREFIX,
  worldBindOrigins,
  type CharacterRigSpriteSheetEntry,
  type CharacterRigSpriteSlice,
} from "@skelio/domain";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useEditorStore } from "../stores/editor.js";
import CharacterRigThreeViewport from "./CharacterRigThreeViewport.vue";
import DepthTextureEditorModal from "./DepthTextureEditorModal.vue";

const store = useEditorStore();
const {
  project,
  characterRigModalOpen,
  selectedCharacterRigSliceId,
  selectedBoneId,
  selectedBone,
  sheetSliceModalOpen,
  rigCameraViewKind,
  placeNewBonesAtParentTip,
} = storeToRefs(store);

const step = ref(0);
const sheetInput = ref<HTMLInputElement | null>(null);
/** Teil-Detail (Smack-ähnliches „Sprite“-Modal). */
const spriteModalSliceId = ref<string | null>(null);
const partEditName = ref("");
const partEditViewName = ref("Default");
const partEditSide = ref<"front" | "back">("front");

const depthTextureModalOpen = ref(false);
const depthTextureModalSliceId = ref<string | null>(null);
const depthTextureModalSide = ref<"front" | "back">("front");

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
  partEditViewName.value = s.viewName ?? "Default";
  partEditSide.value = s.side === "back" ? "back" : "front";
});

const steps = [
  {
    id: "sprites",
    title: "Sprites",
    hint: "Links: + Neu = neuer Teil (Slot). Rechts: Sprite-Sheet hinzufügen, Sheet anklicken, Bereich wählen → in gewählten Slot. Mitte: anordnen.",
  },
  {
    id: "bones",
    title: "Knochen",
    hint: "Links: Hierarchie, + Neu = Kind des gewählten Knochens. Neuen Knochen im Viewport klicken zum Platzieren, Punkt ziehen zum Verschieben. Detaillierte Werte im Inspector (Hauptfenster).",
  },
  {
    id: "bind",
    title: "Binden",
    hint: "Links Teile, rechts Sheets + Knochen-Überblick. Unten: jedes Teil einem Knochen zuordnen.",
  },
  {
    id: "depth",
    title: "3D / Meshing",
    hint: "Tiefe pro Teil (Front/Back). Meshes sync erzeugt Geometrie; im Viewport erscheint Extrusion entlang Z (WebGL).",
  },
  { id: "preview", title: "Vorschau", hint: "Überblick über Zuordnungen." },
] as const;

const rig = computed(() => project.value.characterRig);
const slices = computed(() => rig.value?.slices ?? []);
const spriteSheets = computed(() => rig.value?.spriteSheets ?? []);
const bindings = computed(() => rig.value?.bindings ?? []);

const bonesSorted = computed(() =>
  [...project.value.bones].sort((a, b) => a.name.localeCompare(b.name)),
);

/** Knochen in Baumreihenfolge (Wurzel zuerst, Kinder nach Name). */
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

/** Schritt 0: nur Sheets; Schritt 1: nur Knochen links, rechts Kurzhinweis; ab Bind wieder Sheets + Knochenliste. */
const showSheetColumn = computed(() => step.value !== 1);
const showBoneColumn = computed(() => step.value >= 2);

/** Abstand Parent-Gelenk → gewählter Knochen (Bind-Pose-Welt), Smack-„Length“-Ersatz ohne extra Feld. */
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
  // Meshing/Depth is easier to understand in perspective.
  if (s === 3 && rigCameraViewKind.value === "2d") store.setRigCameraViewKind("2.5d");
});

function bindingBoneId(sliceId: string): string {
  return bindings.value.find((b) => b.sliceId === sliceId)?.boneId ?? "";
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

function setDepth(sliceId: string, front: number, back: number, sync: boolean) {
  store.dispatch({
    type: "setCharacterRigSliceDepth",
    sliceId,
    maxDepthFront: front,
    maxDepthBack: back,
    syncBackWithFront: sync,
  });
}

function syncMeshingFromRig() {
  const ok = store.dispatch({ type: "syncCharacterRigSkinnedMeshes" });
  if (!ok) {
    alert("Mesh-Sync abgelehnt (Validierung). Prüfe: jedes Teil mit Pixeln braucht einen Knochen im Schritt „Binden“.");
  }
}

/** Ein Projekt: Rig-Daten und `skinnedMeshes` sind identisch — vor dem Zurück in die Hauptansicht Meshes aus dem Rig schreiben. */
function finishRigAndClose() {
  const ok = store.dispatch({ type: "syncCharacterRigSkinnedMeshes" });
  if (!ok) {
    alert("Mesh-Sync abgelehnt (Validierung). Prüfe Bindungen und Teile mit Pixeln, dann erneut „Fertig“.");
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
    viewName: partEditViewName.value,
    side: partEditSide.value,
  });
  if (!ok) alert("Speichern fehlgeschlagen (Projekt-Validierung). Details in der Konsole.");
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
    alert("Name konnte nicht gespeichert werden.");
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
        reject(new Error("Bild konnte nicht gelesen werden."));
        return;
      }
      let mime = m[1]!.trim().toLowerCase();
      const dataBase64 = m[2]!.replace(/\s/g, "");
      if (!mime || mime === "application/octet-stream") {
        mime = (file.type || mimeFromFileName(file.name) || "").toLowerCase();
      }
      resolve({ fileName: file.name, mimeType: mime, dataBase64 });
    };
    fr.onerror = () => reject(fr.error ?? new Error("Lesen fehlgeschlagen"));
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
    alert("Zuerst links einen Teil anlegen oder auswählen (Sheet-Zuweisung braucht einen aktiven Slot).");
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
  const name = `Knochen ${bones.length + 1}`;
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
    alert("Name konnte nicht gespeichert werden.");
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
    alert("Sprite-Sheet konnte nicht hinzugefügt werden (PNG / JPEG / WebP).");
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
            <button type="button" class="close" title="Schließen (Esc)" @click="close">×</button>
          </div>
        </header>

        <div class="body">
          <section v-if="step !== 1" class="sprite-rail" aria-label="Sprites und Ansicht">
            <div class="rail-title">Sprites</div>
            <div class="rail-table-wrap">
              <table v-if="slices.length" class="rail-table">
                <thead>
                  <tr>
                    <th>Sprite</th>
                    <th>View</th>
                    <th>Seite</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="s in slices"
                    :key="s.id"
                    class="rail-row"
                    :class="{ active: selectedCharacterRigSliceId === s.id }"
                    @click="store.selectCharacterRigSlice(s.id)"
                    @dblclick="openPartModal(s.id)"
                  >
                    <td class="rail-name" @click.stop>
                      <input
                        class="rail-input rail-name-input"
                        type="text"
                        :value="s.name"
                        :title="'Name: ' + s.name"
                        @change="onSliceNameChange(s, $event)"
                      />
                      <span v-if="s.width <= 0 || s.height <= 0" class="dim"> (leer)</span>
                    </td>
                    <td @click.stop>
                      <input
                        class="rail-input"
                        type="text"
                        :value="s.viewName ?? 'Default'"
                        title="Ansicht (z. B. Default)"
                        @change="
                          store.dispatch({
                            type: 'patchCharacterRigSlice',
                            sliceId: s.id,
                            viewName: ($event.target as HTMLInputElement).value,
                          })
                        "
                      />
                    </td>
                    <td @click.stop>
                      <select
                        class="rail-select"
                        :value="s.side ?? 'front'"
                        @change="
                          setSliceSide(s.id, ($event.target as HTMLSelectElement).value as 'front' | 'back')
                        "
                      >
                        <option value="front">Front</option>
                        <option value="back">Back</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="muted rail-empty">Noch keine Sprites — „+ Neu“ für einen neuen Teil (Slot).</p>
            </div>
            <button type="button" class="rail-new" @click="addEmptySlot">+ Neu</button>
          </section>

          <section v-else class="sprite-rail bone-rail" aria-label="Knochen-Hierarchie">
            <div class="rail-title">Knochen</div>
            <p class="muted rail-bone-intro">
              Einrückung = Kind von oben. <strong>+ Neu</strong> = Kind des <strong>markierten</strong> Knochens
              (sonst unter Wurzel). Neu erscheint orange — <strong>Klick</strong> in die Ansicht platziert, dann
              ziehen.
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
              <p v-else class="muted rail-empty">Keine Knochen.</p>
            </div>
            <button type="button" class="rail-new rail-new-bone" @click="addChildBone">+ Neu</button>
          </section>

          <nav class="nav" aria-label="Ablauf">
            <button
              v-for="(s, i) in steps"
              :key="s.id"
              type="button"
              class="nav-btn"
              :class="{ active: step === i }"
              @click="step = i"
            >
              {{ i + 1 }}. {{ s.title }}
            </button>
          </nav>

          <div class="main-col">
            <div class="rig-camera-bar" role="tablist" aria-label="Kamera-Modus (Character Rig)">
              <span class="rig-camera-label">Kamera</span>
              <div class="rig-camera-seg">
                <button
                  type="button"
                  class="rig-cam-btn"
                  :class="{ on: rigCameraViewKind === '2d' }"
                  role="tab"
                  :aria-selected="rigCameraViewKind === '2d'"
                  @click="store.setRigCameraViewKind('2d')"
                >
                  2D
                </button>
                <button
                  type="button"
                  class="rig-cam-btn"
                  :class="{ on: rigCameraViewKind === '2.5d' }"
                  role="tab"
                  :aria-selected="rigCameraViewKind === '2.5d'"
                  @click="store.setRigCameraViewKind('2.5d')"
                >
                  2.5D
                </button>
                <button
                  type="button"
                  class="rig-cam-btn"
                  :class="{ on: rigCameraViewKind === '3d' }"
                  role="tab"
                  :aria-selected="rigCameraViewKind === '3d'"
                  @click="store.setRigCameraViewKind('3d')"
                >
                  3D
                </button>
              </div>
              <span class="muted rig-camera-cap">WebGL · Ortho / Perspektive · Modal zu = 2D</span>
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
                  Links neue <strong>Teile</strong> anlegen, rechts <strong>Sprite-Sheets</strong> laden, Sheet
                  anklicken, im Modal Bereich wählen (Klick oder Rahmen). Gewählten Teil zuvor in der linken Liste
                  anklicken. Teile im Viewport ziehen.
                </p>
                <p class="muted future-note">
                  Der Bereich unter dem Viewport ist für spätere Werkzeuge gedacht — z. B. einen Pixel-Editor pro Teil
                  (Retusche, Masken) oder ähnliche Schritte, sobald das ansteht.
                </p>
              </div>

              <div v-show="step === 1" class="panel">
                <p class="muted">
                  Links Hierarchie und <strong>+ Neu</strong>. Neuen Knochen im Viewport per <strong>Klick</strong>
                  platzieren, danach am Punkt ziehen. Rechts: Bind-Werte wie im Inspector.
                </p>
                <p class="muted roadmap-hint">
                  <strong>Length:</strong> Griff oder <strong>Shift+Gelenk</strong> ziehen, <strong>Esc</strong> =
                  Vorschau abbrechen, loslassen = speichern.
                  <strong>Kette:</strong> an Spitze / folgen (rechts). <strong>Kamera</strong> 2D (Ortho) · 2.5D / 3D
                  (Perspektive, Tiefe = Extrusion).
                </p>
              </div>

              <div v-show="step === 2" class="panel">
                <p v-if="!slices.length" class="muted">Zuerst links Sprites (+ Neu) anlegen und ggf. Pixel aus Sheets zuweisen.</p>
                <table v-else class="bind-table">
                  <thead>
                    <tr>
                      <th>Teil</th>
                      <th>Knochen</th>
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
              </div>

              <div v-show="step === 3" class="panel">
                <div class="meshing-block">
                  <h4 class="meshing-title">Meshing</h4>
                  <p class="muted meshing-copy">
                    Wie in Smack: zuerst <strong>Binden</strong> (Teil → Knochen), hier <strong>Tiefe</strong> einstellen,
                    dann <strong>Meshes erzeugen</strong>. Pro gebundenem Teil entsteht ein Quad (bei Tiefe &gt; 0 zwei
                    Schichten im 2D-Welt-Raum für Skinning). Im Character-Rig-WebGL-Viewport erscheint dieselbe Tiefe als
                    <strong>Extrusion entlang Z</strong>. Blaues Mesh = Skinning-Vorschau; Runtime-Export enthält
                    <code>skins</code>.
                  </p>
                  <button type="button" class="primary meshing-btn" @click="syncMeshingFromRig">
                    Meshes aus Rig erzeugen / aktualisieren
                  </button>
                  <p class="muted meshing-count">
                    Rig-Meshes im Projekt: <strong>{{ rigGeneratedMeshCount }}</strong>
                    <span v-if="rigGeneratedMeshCount > 0">(IDs <code>rig_slice_…</code>)</span>
                  </p>
                </div>
                <p v-if="!slices.length" class="muted">Keine Teile — links Slots anlegen.</p>
                <div v-for="s in slices" :key="s.id" class="depth-row">
                  <label class="depth-label">{{ s.name }}</label>
                  <div class="depth-tools">
                    <button type="button" class="mini depth-btn" @click="openDepthTextureModal(s.id, 'front')">
                      Depth texture… (Front)
                    </button>
                    <button type="button" class="mini depth-btn" @click="openDepthTextureModal(s.id, 'back')">
                      Depth texture… (Back)
                    </button>
                  </div>
                  <label class="mini"
                    >Vorne max
                    <input
                      type="number"
                      step="0.1"
                      :value="depthFor(s.id).maxDepthFront"
                      @change="
                        setDepth(
                          s.id,
                          Number(($event.target as HTMLInputElement).value),
                          depthFor(s.id).maxDepthBack,
                          depthFor(s.id).syncBackWithFront,
                        )
                      "
                  /></label>
                  <label class="mini"
                    >Hinten max
                    <input
                      type="number"
                      step="0.1"
                      :disabled="depthFor(s.id).syncBackWithFront"
                      :value="depthFor(s.id).maxDepthBack"
                      @change="
                        setDepth(
                          s.id,
                          depthFor(s.id).maxDepthFront,
                          Number(($event.target as HTMLInputElement).value),
                          depthFor(s.id).syncBackWithFront,
                        )
                      "
                  /></label>
                  <label class="mini chk"
                    ><input
                      type="checkbox"
                      :checked="depthFor(s.id).syncBackWithFront"
                      @change="
                        setDepth(
                          s.id,
                          depthFor(s.id).maxDepthFront,
                          depthFor(s.id).maxDepthBack,
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    />
                    Hinten = vorne</label
                  >
                </div>
              </div>

              <div v-show="step === 4" class="panel">
                <p>
                  <strong>{{ bindings.length }}</strong> Zuordnung(en), <strong>{{ slices.length }}</strong> Teil(e).
                  Gespeichert unter <code>characterRig</code>.
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

          <aside class="tools" aria-label="Werkzeuge">
            <div v-if="showSheetColumn" class="tools-block tools-block-sheets">
              <h3 class="tools-title">Sprite sheets</h3>
              <p class="tools-hint muted">
                Nur Roh-Texturen. Klick öffnet Auswahl für den <strong>links gewählten</strong> Teil.
              </p>
              <button type="button" class="primary tools-import" @click="triggerSheetImport">
                Sprite-Sheet hinzufügen…
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
                  <button type="button" class="tools-remove" title="Sheet entfernen" @click.stop="removeSheet(sh.id)">
                    ×
                  </button>
                </li>
              </ul>
              <p v-else class="muted tools-empty">Noch keine Sheets — PNG / JPEG / WebP hinzufügen.</p>
            </div>

            <div v-if="step === 1" class="tools-block bone-settings-aside">
              <h3 class="bone-settings-title">
                Bone Settings<span v-if="selectedBone" class="bone-settings-name">: {{ selectedBone.name }}</span>
              </h3>
              <p v-if="!selectedBone" class="muted bone-settings-sub">Kein Knochen gewählt</p>
              <p class="muted bone-settings-note">
                Skelio: <strong>2D-Bindpose</strong> plus <strong>Length</strong> (lokales +X). Gleiche Kernfelder wie
                im Inspector.
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
                  Wurzel: oft <strong>Length 0</strong> (nur Gelenk). Griff oder <strong>Shift+Gelenk</strong> ziehen;
                  <strong>Esc</strong> bricht die Längen-Vorschau ab. Zug folgt der Knochenachse (Bind-Pose-Ebene).
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
                <div v-if="selectedBone.parentId" class="bs-hybrid">
                  <p class="muted bs-hybrid-title">Kette / Spitze</p>
                  <label class="bs-rowchk">
                    <input
                      type="checkbox"
                      :checked="placeNewBonesAtParentTip"
                      @change="store.setPlaceNewBonesAtParentTip(($event.target as HTMLInputElement).checked)"
                    />
                    + Neu an Parent-Spitze (wenn Length größer 0)
                  </label>
                  <button type="button" class="bs-mini" @click="snapSelectedToParentTip">An Spitze schnappen</button>
                  <label class="bs-rowchk">
                    <input
                      type="checkbox"
                      :checked="!!selectedBone.followParentTip"
                      @change="setSelectedFollowParentTip($event)"
                    />
                    Parent-Spitze folgen
                  </label>
                </div>
                <p v-if="selectedBone.parentId && selectedBoneParentSpan !== null" class="muted bs-chain">
                  Abstand Parent-Gelenk → dieses Gelenk: <strong>{{ selectedBoneParentSpan.toFixed(1) }}</strong>
                  <span class="dim"> (von Bind X/Y; unabhängig von Length)</span>
                </p>
                <p v-else-if="selectedBone" class="muted bs-chain">
                  <span class="dim">Wurzel — kein Parent-Abstand.</span>
                </p>
              </template>
            </div>

            <div v-if="showBoneColumn" class="tools-block tools-block-bones" :class="{ 'tools-divider': showSheetColumn }">
              <h3 class="tools-title tools-title-bones">Knochen (Überblick)</h3>
              <p class="tools-hint muted">
                Klick = Auswahl. „Kind anlegen“ = wie links „+ Neu“ (Kind des gewählten Knochens).
              </p>
              <button type="button" class="primary bone-add-btn" @click="addChildBone">Kind anlegen</button>
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
            Änderungen sofort im Projekt (Undo/Redo). „Fertig“ synchronisiert Rig-Meshes für die Hauptansicht.
          </span>
          <button type="button" class="primary" @click="finishRigAndClose">Fertig</button>
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
          <button type="button" class="part-close" title="Schließen" @click="closePartModal">×</button>
        </header>
        <div class="part-body">
          <div class="part-preview-wrap">
            <img
              v-if="thumbDataUrl(partModalSlice)"
              class="part-preview-img"
              :src="thumbDataUrl(partModalSlice)"
              alt=""
            />
            <div v-else class="part-preview-ph">Kein eingebettetes Bild</div>
          </div>
          <label class="part-field"
            >Name
            <input v-model="partEditName" class="part-input" type="text" />
          </label>
          <label class="part-field"
            >View
            <input v-model="partEditViewName" class="part-input" type="text" placeholder="Default" />
          </label>
          <label class="part-field"
            >Seite
            <select v-model="partEditSide" class="part-input">
              <option value="front">Front</option>
              <option value="back">Back</option>
            </select>
          </label>
        </div>
        <footer class="part-foot">
          <button type="button" class="ghost" @click="closePartModal">Schließen</button>
          <button type="button" class="primary" @click="applyPartModal">Übernehmen</button>
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
  /* Mitte mindestens ~40% / 320px — verhindert „dünne“ Viewport-Spalte; rechts fest schmal */
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
.rail-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rail-table {
  width: 100%;
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
.main-col {
  display: flex;
  flex-direction: column;
  min-width: min(100%, 320px);
  min-height: 0;
}
.rig-camera-bar {
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
.rig-camera-seg {
  display: inline-flex;
  border-radius: 6px;
  border: 1px solid #444;
  overflow: hidden;
}
.rig-cam-btn {
  padding: 0.28rem 0.65rem;
  border: none;
  border-right: 1px solid #444;
  background: #25262b;
  color: #9ca3af;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.rig-cam-btn:last-child {
  border-right: none;
}
.rig-cam-btn:hover {
  background: #2e3138;
  color: #e5e7eb;
}
.rig-cam-btn.on {
  background: #3730a3;
  color: #eef;
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
