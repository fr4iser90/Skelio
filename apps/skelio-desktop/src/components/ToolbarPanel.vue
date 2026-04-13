<script setup lang="ts">
import {
  createId,
  meshDisplayNameFromFileName,
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
  skinnedMeshFromObjText,
} from "@skelio/domain";
import { ref } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { isTauriApp } from "../tauriProjectFs.js";

const store = useEditorStore();
const tauri = isTauriApp();
const fileInput = ref<HTMLInputElement | null>(null);
const refImageInput = ref<HTMLInputElement | null>(null);
const objMeshInput = ref<HTMLInputElement | null>(null);
/** OBJ: negate vertex Y (typical Y-up mesh vs. canvas Y-down). */
const objImportFlipY = ref(false);

function triggerLoad() {
  fileInput.value?.click();
}
function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      store.loadFromJson(String(r.result));
    } catch (err) {
      alert(String(err));
    }
  };
  r.readAsText(f);
  (e.target as HTMLInputElement).value = "";
}

function triggerRefImage() {
  refImageInput.value?.click();
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

async function onRefImageFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!f) return;
  try {
    const payload = await readImageFileAsPayload(f);
    const mime = normalizeReferenceImageMime(payload.mimeType);
    if (!mime) {
      alert("Nur PNG, JPEG oder WebP werden unterstützt.");
      return;
    }
    store.dispatch({
      type: "setReferenceImage",
      fileName: payload.fileName,
      mimeType: mime,
      dataBase64: payload.dataBase64,
    });
  } catch (err) {
    alert(String(err));
  }
}

async function onOpenProjectFolder() {
  try {
    await store.openProjectFolder();
  } catch (err) {
    alert(String(err));
  }
}

async function onSaveProjectFolder() {
  try {
    await store.saveProjectToFolder();
  } catch (err) {
    alert(String(err));
  }
}

async function onSaveProjectFolderAs() {
  try {
    await store.saveProjectToFolderAs();
  } catch (err) {
    alert(String(err));
  }
}

function triggerObjMesh() {
  objMeshInput.value?.click();
}

function onObjMeshFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = "";
  if (!f) return;
  const boneId = store.selectedBoneId;
  if (!boneId) {
    alert("Kein Knochen ausgewählt.");
    return;
  }
  const r = new FileReader();
  r.onload = () => {
    const text = String(r.result);
    const parsed = skinnedMeshFromObjText(text, {
      id: createId("mesh"),
      name: meshDisplayNameFromFileName(f.name),
      boneId,
      flipY: objImportFlipY.value,
    });
    if ("error" in parsed) {
      alert(parsed.error);
      return;
    }
    store.dispatch({ type: "addSkinnedMesh", mesh: parsed.mesh });
  };
  r.readAsText(f);
}

function download(name: string, body: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<template>
  <header class="bar">
    <strong class="brand">Skelio</strong>
    <button type="button" @click="store.newProject()">Neu</button>
    <button type="button" @click="triggerLoad">Laden…</button>
    <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFile" />
    <template v-if="tauri">
      <button type="button" title="Pfad zum Ordner mit project.skelio.json (Dialog)" @click="onOpenProjectFolder">Ordner…</button>
      <button type="button" title="Nach project.skelio.json im gewählten Ordner speichern" @click="onSaveProjectFolder">Ordner speichern</button>
      <button type="button" class="ghost" title="Anderen Zielordner (Pfad)" @click="onSaveProjectFolderAs">Speichern unter…</button>
    </template>
    <button type="button" title="Smack-ähnlich: Sheet, Slices, Knochen binden, Tiefe" @click="store.openCharacterRigModal()">
      Character Rig…
    </button>
    <button type="button" title="Sheet temporär laden, Rechtecke ziehen — eigenes Fenster" @click="store.openSpriteSheetSliceModal()">
      Sprite-Sheet…
    </button>
    <button type="button" @click="triggerRefImage">Referenzbild…</button>
    <input
      ref="refImageInput"
      type="file"
      class="hidden"
      :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
      @change="onRefImageFile"
    />
    <button
      v-if="store.project.referenceImage"
      type="button"
      class="ghost"
      @click="store.dispatch({ type: 'clearReferenceImage' })"
    >
      Referenz weg
    </button>
    <button type="button" title="Quad am Root-Knochen (Skinning-Demo)" @click="store.dispatch({ type: 'addDemoSkinnedMesh' })">
      Demo-Mesh
    </button>
    <button type="button" class="ghost" title="IK: zwei Knochen unter Root + FABRIK-Ziel (Inspector)" @click="store.dispatch({ type: 'addDemoIkChain' })">
      IK-Demo
    </button>
    <button type="button" title="Wavefront OBJ (2D: v x y, Dreiecke/Vierecke); Gewicht 100% auf ausgewähltem Knochen" @click="triggerObjMesh">
      OBJ import…
    </button>
    <label class="chk" title="Y negieren — oft nötig wenn die Geometrie Y-up exportiert wurde (Skelio: Y nach unten)">
      <input v-model="objImportFlipY" type="checkbox" />
      Y spiegeln
    </label>
    <input ref="objMeshInput" type="file" accept=".obj,text/plain" class="hidden" @change="onObjMeshFile" />
    <button
      v-if="store.project.skinnedMeshes?.length"
      type="button"
      class="ghost"
      @click="store.dispatch({ type: 'clearSkinnedMeshes' })"
    >
      Meshes löschen
    </button>
    <button type="button" @click="download(`${store.project.meta.name || 'project'}.skelio.json`, store.saveEditorJson())">
      Speichern (Editor)
    </button>
    <button type="button" @click="download(`${store.project.meta.name || 'export'}-runtime.json`, store.saveRuntimeJson())">
      Export Runtime
    </button>
    <span v-if="store.projectRootPath" class="path" :title="store.projectRootPath">{{ store.projectManifestFileName }} @ …{{ store.projectRootPath.slice(-24) }}</span>
    <span class="sp" />
    <button type="button" @click="store.undo()">Undo</button>
    <button type="button" @click="store.redo()">Redo</button>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #333;
  background: #25262b;
}
.brand {
  margin-right: 0.5rem;
  color: #a5b4fc;
}
button {
  padding: 0.35rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  color: inherit;
  cursor: pointer;
}
button:hover {
  background: #3b3f48;
}
button.ghost {
  border-color: #555;
  color: #9ca3af;
}
.sp {
  flex: 1;
}
.path {
  font-size: 0.7rem;
  color: #6b7280;
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hidden {
  display: none;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: #9ca3af;
  cursor: pointer;
  user-select: none;
}
.chk input {
  cursor: pointer;
}
</style>
