import type { EditorProject } from "./types.js";

/** In-place fixups for older saved JSON (e.g. slices without world position). */
export function normalizeEditorProjectInPlace(project: EditorProject): void {
  const rig = project.characterRig;
  if (!rig?.slices?.length) return;
  let i = 0;
  for (const s of rig.slices) {
    if (typeof s.worldCx !== "number" || !Number.isFinite(s.worldCx)) s.worldCx = i * 14;
    if (typeof s.worldCy !== "number" || !Number.isFinite(s.worldCy)) s.worldCy = i * 14;
    i++;
  }
}
