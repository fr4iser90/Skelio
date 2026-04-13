import { createId } from "./ids.js";
import type { EditorProject } from "./types.js";

function ensureBoneLengths(project: EditorProject): void {
  const childrenOf = (id: string) => project.bones.filter((c) => c.parentId === id);
  for (const b of project.bones) {
    if (typeof b.length === "number" && Number.isFinite(b.length) && b.length >= 0) {
      continue;
    }
    const kids = childrenOf(b.id);
    if (kids.length === 0) {
      b.length = b.parentId === null ? 0 : 40;
    } else {
      let m = 0;
      for (const c of kids) {
        m = Math.max(m, Math.hypot(c.bindPose.x, c.bindPose.y));
      }
      b.length = Math.max(1e-6, m);
    }
  }
}

/** In-place fixups for older saved JSON (positions, legacy single sheet → spriteSheets). */
export function normalizeEditorProjectInPlace(project: EditorProject): void {
  ensureBoneLengths(project);
  for (const b of project.bones) {
    if (b.followParentTip != null && typeof b.followParentTip !== "boolean") {
      delete b.followParentTip;
    }
    if (b.followParentTip && b.parentId === null) {
      delete b.followParentTip;
    }
  }
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
