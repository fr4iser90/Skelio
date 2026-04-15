import { createId } from "./ids.js";
import type { EditorProject } from "./types.js";

/**
 * Legacy clips stored tx/ty/tz/rot/tilt/spin as **absolute** bind-local values; the editor now uses
 * **offsets from bind** so empty or zero keys do not override the armature rest pose.
 */
function migrateClipTransformsToBindRelative(project: EditorProject): void {
  if (project.meta.clipTransformsRelativeToBind === true) return;
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  for (const clip of project.clips) {
    for (const tr of clip.tracks) {
      const bone = byId.get(tr.boneId);
      if (!bone) continue;
      const bp = bone.bindPose;
      const b3 = bone.bindBone3d;
      const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
      const tilt0 = b3?.tilt ?? 0;
      const spin0 = b3?.spin ?? 0;
      for (const ch of tr.channels) {
        if (ch.property === "tx") for (const k of ch.keys) k.v -= bp.x;
        else if (ch.property === "ty") for (const k of ch.keys) k.v -= bp.y;
        else if (ch.property === "rot") for (const k of ch.keys) k.v -= bp.rotation;
        else if (ch.property === "tz") for (const k of ch.keys) k.v -= zBase;
        else if (ch.property === "tilt") for (const k of ch.keys) k.v -= tilt0;
        else if (ch.property === "spin") for (const k of ch.keys) k.v -= spin0;
      }
    }
  }
  project.meta.clipTransformsRelativeToBind = true;
}

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
    if (b.bindBone3d) {
      const d = b.bindBone3d;
      const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v);
      if (!ok(d.z) || !ok(d.depthOffset) || !ok(d.tilt) || !ok(d.spin)) {
        delete b.bindBone3d;
      }
    }
  }
  migrateClipTransformsToBindRelative(project);
  const rig = project.characterRig;
  if (!rig) return;

  if (!rig.spriteSheets) rig.spriteSheets = [];
  if (!rig.slices) rig.slices = [];
  if (!rig.bindings) rig.bindings = [];
  // `rotOffset` was an experimental binding field; keep default behavior (follow bone rotation).
  for (const b of rig.bindings) {
    delete (b as { rotOffset?: number }).rotOffset;
  }

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
    delete (s as { viewName?: string }).viewName;
    if (s.side !== "front" && s.side !== "back") s.side = "front";
    const eb = s.embeddedBack;
    if (eb) {
      const w = s.width;
      const h = s.height;
      const bad =
        typeof eb.dataBase64 !== "string" ||
        eb.dataBase64.length === 0 ||
        !(eb.pixelWidth > 0) ||
        !(eb.pixelHeight > 0) ||
        eb.pixelWidth !== w ||
        eb.pixelHeight !== h;
      if (bad) delete s.embeddedBack;
    }
    i++;
  }

  if (!rig.sliceDepths) rig.sliceDepths = [];
  // Depth textures are editor-only; nothing to migrate yet. Keep existing entries.
}
