<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { ref } from "vue";
import { useEditorStore } from "../stores/editor.js";
import { isTauriApp } from "../tauriProjectFs.js";

const store = useEditorStore();
const tauri = isTauriApp();

/**
 * Toolbar layout:
 * - `menubar-row`: File / Edit / View, Character Setup, settings anchor, help
 * - `context-row`: animator viewport toggles (rigging lives in Character Setup modal only)
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
        <!-- Mount point for future Settings popover (keybindings, etc.). -->
        <div id="toolbar-settings-anchor" class="toolbar-settings-anchor" aria-hidden="true" />
      </div>

      <!-- Character Setup: rigging wizard (modal only). -->
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
      <span class="ctx-hint">
        Viewport + timeline · Rigging under <strong>Character Setup…</strong> above.
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

      <span v-if="store.projectRootPath" class="path" :title="store.projectRootPath">
        {{ store.projectManifestFileName }} @ …{{ store.projectRootPath.slice(-24) }}
      </span>
      <div v-if="saveFeedback" class="save-feedback" :class="{ err: !saveFeedback.ok }" role="status">
        <span class="save-feedback-text">{{ saveFeedback.text }}</span>
        <button type="button" class="save-feedback-close" title="Close" @click="dismissSaveFeedback">×</button>
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFile" />

    <dialog ref="helpDialog" class="help-dlg" @click.self="closeHelp">
      <div class="help-dlg-inner">
        <h2 class="help-dlg-title">Toolbar</h2>
        <p>
          <strong>Character Setup…</strong> opens the rigging wizard (modal). The row below toggles animator viewport
          options only.
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
