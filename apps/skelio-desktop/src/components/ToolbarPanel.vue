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
import { storeToRefs } from "pinia";
import { ref } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { isTauriApp } from "../tauriProjectFs.js";

const store = useEditorStore();
const { workspaceMode, rigCharacterSlots, activeCharacterId } = storeToRefs(store);
const tauri = isTauriApp();

/**
 * Toolbar layout (extend without stuffing unrelated UI into workspace tabs):
 * - `menubar-row`: File / Edit / View
 * - `toolbar-workspace-region`: workspace mode tabs only; reserve adjacent slot for Settings (gear → prefs modal)
 * - Future prefs: keymap JSON (override defaults in ViewportPanel), themes, audio — single store + `localStorage` sync
 * - `btn-character-setup`: always visible
 * - Trailing: help — future: optional Settings button before `?`
 */
const menubarEl = ref<HTMLElement | null>(null);
const helpDialog = ref<HTMLDialogElement | null>(null);

function closeMenus() {
  menubarEl.value?.querySelectorAll("details.menu").forEach((el) => {
    (el as HTMLDetailsElement).open = false;
  });
}

function onMenuToggle(ev: Event) {
  const d = ev.target as HTMLDetailsElement;
  if (!d.open) return;
  menubarEl.value?.querySelectorAll("details.menu").forEach((x) => {
    if (x !== d) (x as HTMLDetailsElement).open = false;
  });
}

function openHelp() {
  closeMenus();
  helpDialog.value?.showModal();
}

function closeHelp() {
  helpDialog.value?.close();
}

function menuNew() {
  closeMenus();
  store.newProject();
}
function menuLoad() {
  closeMenus();
  triggerLoad();
}
function menuOpenFolder() {
  closeMenus();
  void onOpenProjectFolder();
}
function menuSaveFolder() {
  closeMenus();
  void onSaveProjectFolder();
}
function menuSaveFolderAs() {
  closeMenus();
  void onSaveProjectFolderAs();
}
function menuSaveEditor() {
  closeMenus();
  void saveEditorProjectToFile();
}
function menuExportRuntime() {
  closeMenus();
  void saveRuntimeExportToFile();
}
function menuUndo() {
  closeMenus();
  store.undo();
}
function menuRedo() {
  closeMenus();
  store.redo();
}

/** Short feedback after save / folder writes (not silent). */
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
      root
        ? `Saved project folder: ${root}/${file} (manifest name is fixed; custom filename: use Save project as file…)`
        : `Project written (${file}).`,
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
  const suggestedName = `${store.rigEditProject.meta.name || "untitled"}.skelio.json`;
  const body = store.saveEditorJson();
  try {
    const path = await invoke<string | null>("save_text_file_with_dialog", {
      defaultName: suggestedName,
      contents: body,
    });
    if (path == null || path === "") {
      showSaveFeedback("Save canceled.", false);
      return;
    }
    showSaveFeedback(`Saved project file: ${path}`);
    return;
  } catch (e) {
    showSaveFeedback(
      `Save failed: ${String(e)}. (Desktop app needs native dialog; on Linux: zenity/kdialog).`,
      false,
    );
    return;
  }
}

async function saveRuntimeExportToFile() {
  const suggestedName = `${store.rigEditProject.meta.name || "export"}-runtime.json`;
  const body = store.saveRuntimeJson();
  try {
    const path = await invoke<string | null>("save_text_file_with_dialog", {
      defaultName: suggestedName,
      contents: body,
    });
    if (path == null || path === "") {
      showSaveFeedback("Export canceled.", false);
      return;
    }
    showSaveFeedback(`Runtime export saved: ${path}`);
    return;
  } catch (e) {
    showSaveFeedback(
      `Export failed: ${String(e)}. (Desktop app needs native dialog; on Linux: zenity/kdialog).`,
      false,
    );
    return;
  }
}
</script>

<template>
  <header class="toolbar-shell">
    <div ref="menubarEl" class="menubar-row">
      <strong class="brand">Skelio</strong>

      <details class="menu" @toggle="onMenuToggle($event)">
        <summary>File</summary>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" @click="menuNew">New project</button>
          <button type="button" role="menuitem" @click="menuLoad">Open…</button>
          <template v-if="tauri">
            <div class="menu-sep" />
            <button
              type="button"
              role="menuitem"
              title="Load a folder project: project.skelio.json and assets/ in that folder."
              @click="menuOpenFolder"
            >
              Open project folder…
            </button>
            <button
              type="button"
              role="menuitem"
              title="Save into the current project folder (no dialog if a folder is already set)."
              @click="menuSaveFolder"
            >
              Save project
            </button>
            <button
              type="button"
              role="menuitem"
              title="Pick a new folder; the manifest file is always project.skelio.json inside it. For a custom .skelio.json filename, use Save project as file…"
              @click="menuSaveFolderAs"
            >
              Save project to different folder…
            </button>
          </template>
          <div class="menu-sep" />
          <button
            type="button"
            role="menuitem"
            title="Save a single .skelio.json file — file dialog with path and filename."
            @click="menuSaveEditor"
          >
            Save project as file…
          </button>
          <button
            type="button"
            role="menuitem"
            title="Export runtime JSON for engine / game use."
            @click="menuExportRuntime"
          >
            Export runtime…
          </button>
        </div>
      </details>

      <details class="menu" @toggle="onMenuToggle($event)">
        <summary>Edit</summary>
        <div class="menu-panel" role="menu">
          <button type="button" role="menuitem" @click="menuUndo">Undo</button>
          <button type="button" role="menuitem" @click="menuRedo">Redo</button>
        </div>
      </details>

      <details class="menu" @toggle="onMenuToggle($event)">
        <summary>View</summary>
        <div class="menu-panel menu-panel--wide" role="menu">
          <label class="menu-chk">
            <input
              type="checkbox"
              :checked="store.animatorRigMeshDeformOverlay"
              @change="store.setAnimatorRigMeshDeformOverlay(($event.target as HTMLInputElement).checked)"
            />
            Mesh overlay
          </label>
          <label class="menu-chk">
            <input
              type="checkbox"
              :checked="store.animatorDeformMeshDraw"
              @change="store.setAnimatorDeformMeshDraw(($event.target as HTMLInputElement).checked)"
            />
            Deform mesh
          </label>
        </div>
      </details>

      <div class="toolbar-workspace-region">
        <div class="mode-tabs" role="tablist" aria-label="Workspace mode">
          <button
            type="button"
            role="tab"
            class="mode-tab"
            :class="{ 'mode-tab--on': workspaceMode === 'animate' }"
            :aria-selected="workspaceMode === 'animate'"
            @click="store.setWorkspaceMode('animate')"
          >
            Animate
          </button>
          <button
            type="button"
            role="tab"
            class="mode-tab"
            :class="{ 'mode-tab--on': workspaceMode === 'rig' }"
            :aria-selected="workspaceMode === 'rig'"
            @click="store.setWorkspaceMode('rig')"
          >
            Rig
          </button>
          <button
            type="button"
            role="tab"
            class="mode-tab"
            :class="{ 'mode-tab--on': workspaceMode === 'export' }"
            :aria-selected="workspaceMode === 'export'"
            @click="store.setWorkspaceMode('export')"
          >
            Export
          </button>
        </div>
        <!-- Mount point for future Settings popover (keybindings, etc.): keep flex gap minimal. -->
        <div id="toolbar-settings-anchor" class="toolbar-settings-anchor" aria-hidden="true" />
      </div>

      <!-- Character Setup: single entry in the top row (always visible in every mode). -->
      <button
        type="button"
        class="btn-character-setup"
        title="Character Setup — geführter Assistent (Wizard)"
        @click="store.openCharacterRigModal()"
      >
        Character Setup…
      </button>

      <span class="grow" />

      <button type="button" class="ghost help-btn" title="Toolbar overview" @click="openHelp">?</button>
    </div>

    <div class="context-row">
      <template v-if="workspaceMode === 'animate'">
        <span class="ctx-hint">
          Viewport + timeline · Rig tools also under <strong>Rig</strong> or <strong>Character Setup…</strong> above.
        </span>
        <label class="chk" title="Animator: Rig-Slice-Meshes als Hilfs-Dreiecke">
          <input
            type="checkbox"
            :checked="store.animatorRigMeshDeformOverlay"
            @change="store.setAnimatorRigMeshDeformOverlay(($event.target as HTMLInputElement).checked)"
          />
          Mesh overlay
        </label>
        <label class="chk" title="Animator: Slices als skinned Mesh">
          <input
            type="checkbox"
            :checked="store.animatorDeformMeshDraw"
            @change="store.setAnimatorDeformMeshDraw(($event.target as HTMLInputElement).checked)"
          />
          Deform mesh
        </label>
        <span v-if="store.quickRigMode" class="quick-rig-pill" role="status">
          Quick Rig on — no keyframe drag on bones/sprites
        </span>
      </template>

      <template v-else-if="workspaceMode === 'rig'">
        <label v-if="rigCharacterSlots.length" class="char-toolbar-picker">
          <span class="muted">Character</span>
          <select
            :value="activeCharacterId ?? ''"
            title="Welcher Charakter: Bones + Rig-Befehle gelten für diesen Slot"
            @change="store.setActiveCharacterId(($event.target as HTMLSelectElement).value || null)"
          >
            <option v-for="c in rigCharacterSlots" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <button
          type="button"
          class="ghost"
          title="Neuer Charakter (eigener Skelett-Root + leeres Rig)"
          @click="store.dispatch({ type: 'addCharacter', name: '' })"
        >
          + Character
        </button>
        <button
          type="button"
          class="ghost"
          :class="{ 'quick-rig-toggle-on': store.quickRigMode }"
          title="Quick Rig"
          @click="store.setQuickRigMode(!store.quickRigMode)"
        >
          Quick Rig
        </button>
        <button type="button" @click="triggerRefImage">Referenzbild…</button>
        <button
          v-if="store.rigEditProject.referenceImage"
          type="button"
          class="ghost"
          @click="store.dispatch({ type: 'clearReferenceImage' })"
        >
          Referenz weg
        </button>
        <button type="button" @click="store.dispatch({ type: 'addDemoSkinnedMesh' })">Demo-Mesh</button>
        <button type="button" class="ghost" @click="store.dispatch({ type: 'addDemoIkChain' })">IK-Demo</button>
        <button type="button" @click="triggerObjMesh">OBJ import…</button>
        <label class="chk" title="OBJ: Y spiegeln">
          <input v-model="objImportFlipY" type="checkbox" />
          Y spiegeln
        </label>
        <button
          v-if="store.rigEditProject.skinnedMeshes?.length"
          type="button"
          class="ghost"
          @click="store.dispatch({ type: 'clearSkinnedMeshes' })"
        >
          Meshes löschen
        </button>
      </template>

      <template v-else>
        <span class="ctx-hint">Folder = manifest + assets/ · File = one .skelio.json with a custom name</span>
        <button
          type="button"
          title="Single .skelio.json — choose path and filename in the dialog."
          @click="saveEditorProjectToFile"
        >
          Save project as file…
        </button>
        <button type="button" class="ghost" title="Runtime JSON for engine use." @click="saveRuntimeExportToFile">
          Export runtime…
        </button>
        <template v-if="tauri">
          <button
            type="button"
            title="Load folder project (project.skelio.json + assets/)."
            @click="onOpenProjectFolder"
          >
            Open folder…
          </button>
          <button
            type="button"
            title="Save into the current project folder."
            @click="onSaveProjectFolder"
          >
            Save project
          </button>
          <button
            type="button"
            title="Pick a new folder; manifest is always project.skelio.json there."
            @click="onSaveProjectFolderAs"
          >
            Other folder…
          </button>
        </template>
      </template>

      <span v-if="store.projectRootPath" class="path" :title="store.projectRootPath">
        {{ store.projectManifestFileName }} @ …{{ store.projectRootPath.slice(-24) }}
      </span>
      <div v-if="saveFeedback" class="save-feedback" :class="{ err: !saveFeedback.ok }" role="status">
        <span class="save-feedback-text">{{ saveFeedback.text }}</span>
        <button type="button" class="save-feedback-close" title="Close" @click="dismissSaveFeedback">×</button>
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFile" />
    <input
      ref="refImageInput"
      type="file"
      class="hidden"
      :accept="REFERENCE_IMAGE_ACCEPT_ATTR"
      @change="onRefImageFile"
    />
    <input ref="objMeshInput" type="file" accept=".obj,text/plain" class="hidden" @change="onObjMeshFile" />

    <dialog ref="helpDialog" class="help-dlg" @click.self="closeHelp">
      <div class="help-dlg-inner">
        <h2 class="help-dlg-title">Toolbar</h2>
        <p>
          <strong>Character Setup…</strong> is only on the first row (purple) and opens the wizard. Under
          <strong>Rig</strong> you get slot picker, Quick Rig, reference image, mesh import, etc.
        </p>
        <p>
          <strong>File</strong>:
          <strong>Open project folder</strong> / <strong>Save project</strong> use a <em>folder</em> on disk (manifest
          <code>project.skelio.json</code> + <code>assets/</code>).
          <strong>Save project as file…</strong> saves <em>one</em> <code>.skelio.json</code> with a name you choose.
        </p>
        <button type="button" class="mini-close" @click="closeHelp">Close</button>
      </div>
    </dialog>
  </header>
</template>

<style scoped>
.toolbar-shell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.4rem 0.65rem 0.5rem;
  border-bottom: 1px solid #333;
  background: #25262b;
}
.menubar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
}
.context-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.5rem;
  min-height: 2rem;
  padding-top: 0.1rem;
  border-top: 1px solid #32333a;
}
.grow {
  flex: 1;
  min-width: 0.5rem;
}
.toolbar-workspace-region {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  position: relative;
}
.toolbar-settings-anchor {
  flex: 0 0 auto;
  width: 0;
  min-height: 1.25rem;
  align-self: stretch;
}
.mode-tabs {
  display: inline-flex;
  border-radius: 8px;
  border: 1px solid #3b3f48;
  overflow: hidden;
  background: #1a1b20;
}
.mode-tab {
  padding: 0.28rem 0.75rem;
  font-size: 0.72rem;
  font-weight: 600;
  border: none;
  border-radius: 0;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}
.mode-tab:hover {
  color: #e5e7eb;
  background: #2a2d36;
}
.mode-tab--on {
  color: #eef2ff;
  background: linear-gradient(180deg, #4338ca 0%, #3730a3 100%);
}
.mode-tab--on:hover {
  color: #fff;
}
.menu {
  position: relative;
}
.menu > summary {
  list-style: none;
  cursor: pointer;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2e3138;
  font-size: 0.78rem;
  color: #e5e7eb;
  user-select: none;
}
.menu > summary::-webkit-details-marker {
  display: none;
}
.menu > summary::after {
  content: " ▾";
  font-size: 0.65rem;
  opacity: 0.75;
}
.menu[open] > summary {
  border-color: #6366f1;
  background: #333748;
}
.menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 11rem;
  padding: 0.35rem;
  border-radius: 8px;
  border: 1px solid #3b3f48;
  background: #1e2028;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.menu-panel--wide {
  min-width: 13rem;
}
.menu-panel button {
  width: 100%;
  text-align: left;
  justify-content: flex-start;
}
.menu-sep {
  height: 1px;
  margin: 0.2rem 0;
  background: #2d3340;
}
.menu-chk {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.45rem;
  font-size: 0.78rem;
  color: #cbd5e1;
  cursor: pointer;
  border-radius: 4px;
}
.menu-chk:hover {
  background: #2a2d36;
}
.ctx-hint {
  font-size: 0.7rem;
  color: #6b7280;
  max-width: min(100%, 22rem);
  line-height: 1.35;
}
.help-btn {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border-radius: 999px;
  font-weight: 700;
}
.help-dlg {
  max-width: 28rem;
  padding: 0;
  border: 1px solid #3b3f48;
  border-radius: 10px;
  background: #1a1b22;
  color: #e5e7eb;
}
.help-dlg::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.help-dlg-inner {
  padding: 1rem 1.1rem 1.1rem;
}
.help-dlg-title {
  margin: 0 0 0.65rem;
  font-size: 1rem;
  color: #a5b4fc;
}
.help-dlg-inner p {
  margin: 0 0 0.55rem;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #cbd5e1;
}
.mini-close {
  margin-top: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #4b5563;
  background: #2e3138;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.8rem;
}
.mini-close:hover {
  background: #3d424c;
}
.btn-character-setup {
  border-color: #6366f1;
  background: linear-gradient(180deg, #3730a3 0%, #312e81 100%);
  color: #eef2ff;
  font-weight: 600;
}
.btn-character-setup:hover {
  background: linear-gradient(180deg, #4c46c4 0%, #3730a3 100%);
}
.brand {
  margin-right: 0.15rem;
  color: #a5b4fc;
  font-size: 0.95rem;
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
