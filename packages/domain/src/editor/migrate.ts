import { createId } from "./ids.js";
import type { EditorProject } from "./types.js";

/** In-place fixups for older saved JSON (positions, legacy single sheet → spriteSheets). */
export function normalizeEditorProjectInPlace(project: EditorProject): void {
  const rig = project.characterRig;
  if (!rig) return;

  if (!rig.spriteSheets) rig.spriteSheets = [];
  if (!rig.slices) rig.slices = [];

  const legacy = rig.spriteSheet;
  if (legacy?.dataBase64 && rig.spriteSheets.length === 0) {
    const id = createId("sheet");
    rig.spriteSheets.push({
      id,
      fileName: legacy.fileName,
      mimeType: legacy.mimeType,
      dataBase64: legacy.dataBase64,
      ...(typeof legacy.pixelWidth === "number" && legacy.pixelWidth > 0 ? { pixelWidth: legacy.pixelWidth } : {}),
      ...(typeof legacy.pixelHeight === "number" && legacy.pixelHeight > 0 ? { pixelHeight: legacy.pixelHeight } : {}),
    });
    for (const s of rig.slices) {
      if (!s.embedded && s.width > 0 && s.height > 0 && !s.sheetId) {
        s.sheetId = id;
      }
    }
  }
  delete rig.spriteSheet;

  let i = 0;
  for (const s of rig.slices) {
    if (typeof s.worldCx !== "number" || !Number.isFinite(s.worldCx)) s.worldCx = i * 14;
    if (typeof s.worldCy !== "number" || !Number.isFinite(s.worldCy)) s.worldCy = i * 14;
    if (typeof s.viewName !== "string" || s.viewName.length === 0) s.viewName = "Default";
    if (s.side !== "front" && s.side !== "back") s.side = "front";
    i++;
  }
}
