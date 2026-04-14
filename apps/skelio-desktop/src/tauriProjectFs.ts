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

/** Ordnerpfad erfragen (kein nativer Dialog — vermeidet GTK/Wayland-Builds; später erweiterbar). */
export function promptProjectRootPath(title: string, current?: string | null): string | null {
  const v = window.prompt(title, current ?? "");
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
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
