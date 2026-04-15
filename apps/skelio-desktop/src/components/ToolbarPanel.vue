<script setup lang="ts">
import {
  createId,
  meshDisplayNameFromFileName,
  mimeFromFileName,
  normalizeReferenceImageMime,
  REFERENCE_IMAGE_ACCEPT_ATTR,
  skinnedMeshFromObjText,
} from "@skelio/domain";
import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { isTauriApp } from "../tauriProjectFs.js";

const store = useEditorStore();
const tauri = isTauriApp();

/** Kurzes Feedback nach Speichern / Ordner-Schreiben (kein stilles Download mehr). */
const saveFeedback = ref<{ ok: boolean; text: string } | null>(null);
let saveFeedbackTimer = 0;

function showSaveFeedback(text: string, ok = true) {
  saveFeedback.value = { ok, text };
  window.clearTimeout(saveFeedbackTimer);
  saveFeedbackTimer = window.setTimeout(() => {
    saveFeedback.value = null;
  }, 8000);
}

function dismissSaveFeedback() {
  saveFeedback.value = null;
  window.clearTimeout(saveFeedbackTimer);
}
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
    const root = store.projectRootPath;
    const file = store.projectManifestFileName;
    showSaveFeedback(
      root ? `Ordner gespeichert: ${root}/${file}` : `Projekt geschrieben (${file}).`,
    );
  } catch (err) {
    alert(String(err));
  }
}

async function onSaveProjectFolderAs() {
  try {
    await store.saveProjectToFolderAs();
    const root = store.projectRootPath;
    const file = store.projectManifestFileName;
    showSaveFeedback(
      root ? `Ordner gewählt und gespeichert: ${root}/${file}` : `Projekt geschrieben (${file}).`,
    );
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

async function saveEditorProjectToFile() {
  const suggestedName = `${store.project.meta.name || "project"}.skelio.json`;
  const body = store.saveEditorJson();
  // Kein Web-Fallback: Speichern muss deterministisch über den nativen Dialog laufen.
  try {
    const path = await invoke<string | null>("save_text_file_with_dialog", {
      defaultName: suggestedName,
      contents: body,
    });
    if (path == null || path === "") {
      showSaveFeedback("Speichern abgebrochen.", false);
      return;
    }
    showSaveFeedback(`Editor-Projekt gespeichert: ${path}`);
    return;
  } catch (e) {
    showSaveFeedback(
      `Speichern nicht möglich: ${String(e)}. (Desktop-App benötigt nativen Dialog; unter Linux: zenity/kdialog).`,
      false,
    );
    return;
  }
}

async function saveRuntimeExportToFile() {
  const suggestedName = `${store.project.meta.name || "export"}-runtime.json`;
  const body = store.saveRuntimeJson();
  try {
    const path = await invoke<string | null>("save_text_file_with_dialog", {
      defaultName: suggestedName,
      contents: body,
    });
    if (path == null || path === "") {
      showSaveFeedback("Export abgebrochen.", false);
      return;
    }
    showSaveFeedback(`Runtime-Export gespeichert: ${path}`);
    return;
  } catch (e) {
    showSaveFeedback(
      `Export nicht möglich: ${String(e)}. (Desktop-App benötigt nativen Dialog; unter Linux: zenity/kdialog).`,
      false,
    );
    return;
  }
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
    <button
      type="button"
      title="Character Setup — geführter Assistent (kein Alltags-Animator): Parts, Bones, Binding, 3D-Tiefe, Vorschau"
      @click="store.openCharacterRigModal()"
    >
      Character Setup…
    </button>
    <button
      type="button"
      class="ghost"
      :class="{ 'quick-rig-toggle-on': store.quickRigMode }"
      title="Quick Rig: Bind-Pose und Knochen-Struktur im Hauptfenster (Viewport wie Setup »Bones«); Animator-Ziehen auf Knochen/Sprites aus"
      @click="store.setQuickRigMode(!store.quickRigMode)"
    >
      Quick Rig
    </button>
    <span v-if="store.quickRigMode" class="quick-rig-pill" role="status">
      Quick Rig an — Bind/Struktur; kein Keyframe-Ziehen auf Knochen/Sprites
    </span>
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
    <button
      type="button"
      title="Desktop-App: nativer „Speichern unter“-Dialog. Browser: Dateiauswahl (Chrome) oder Download."
      @click="saveEditorProjectToFile"
    >
      Speichern…
    </button>
    <button
      type="button"
      title="Runtime-JSON exportieren (Dateiauswahl oder Download)"
      @click="saveRuntimeExportToFile"
    >
      Export Runtime
    </button>
    <span v-if="store.projectRootPath" class="path" :title="store.projectRootPath">{{ store.projectManifestFileName }} @ …{{ store.projectRootPath.slice(-24) }}</span>
    <div v-if="saveFeedback" class="save-feedback" :class="{ err: !saveFeedback.ok }" role="status">
      <span class="save-feedback-text">{{ saveFeedback.text }}</span>
      <button type="button" class="save-feedback-close" title="Schließen" @click="dismissSaveFeedback">×</button>
    </div>
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
button.quick-rig-toggle-on {
  border-color: #d97706;
  color: #fde68a;
  background: rgba(120, 53, 15, 0.45);
}
.quick-rig-pill {
  font-size: 0.72rem;
  color: #fcd34d;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(217, 119, 6, 0.55);
  background: rgba(120, 53, 15, 0.35);
  white-space: nowrap;
  max-width: min(42vw, 22rem);
  overflow: hidden;
  text-overflow: ellipsis;
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
.save-feedback {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.35rem;
  max-width: min(36vw, 22rem);
  padding: 0.35rem 0.45rem 0.35rem 0.55rem;
  border-radius: 6px;
  font-size: 0.68rem;
  line-height: 1.35;
  color: #d1fae5;
  background: rgba(6, 78, 59, 0.45);
  border: 1px solid #34d399;
}
.save-feedback.err {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.35);
  border-color: #f87171;
}
.save-feedback-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.save-feedback-close {
  flex-shrink: 0;
  padding: 0 0.35rem;
  line-height: 1.2;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
  font-size: 1rem;
}
.save-feedback-close:hover {
  opacity: 1;
}
</style>
