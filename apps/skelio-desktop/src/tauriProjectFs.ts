import { invoke } from "@tauri-apps/api/core";

export function isTauriApp(): boolean {
  const envPlatform = import.meta.env.TAURI_ENV_PLATFORM;
  if (envPlatform != null && envPlatform !== "") return true;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
}

/** Nativer Ordner-Dialog (zenity/kdialog / OS), kein `window.prompt`. */
export async function pickProjectRootFolder(defaultPath?: string | null): Promise<string | null> {
  if (!isTauriApp()) return null;
  const t = (defaultPath ?? "").trim();
  return invoke<string | null>("pick_project_folder_with_dialog", {
    defaultPath: t.length > 0 ? t : null,
  });
}

export async function readProjectManifest(root: string): Promise<string> {
  return invoke<string>("read_project_manifest", { root });
}

export async function writeProjectManifest(root: string, content: string): Promise<void> {
  await invoke("write_project_manifest", { root, content });
}

/** Read a UTF-8 file under the project root (must start with `assets/`). */
export async function readProjectSubpath(root: string, relativePath: string): Promise<string> {
  return invoke<string>("read_project_subpath", { root, relativePath });
}

/** Write a UTF-8 file under the project root (must start with `assets/`). */
export async function writeProjectSubpath(root: string, relativePath: string, content: string): Promise<void> {
  await invoke("write_project_subpath", { root, relativePath, content });
}
