import { normalizeReferenceImageMime } from "./referenceImage.js";
import { validateSkinnedMesh } from "./skinning.js";
import type { ChannelProperty, EditorProject } from "./types.js";

const VALID_EDITOR_CHANNEL_PROPERTIES: ChannelProperty[] = ["tx", "ty", "tz", "rot", "tilt", "spin"];

export type ValidationIssue = { path: string; message: string };

export function validateEditorProject(project: EditorProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (project.editorSchemaVersion !== "1.0.0") {
    issues.push({ path: "editorSchemaVersion", message: "unsupported editor file version" });
  }
  const { bones, clips, activeClipId } = project;

  const ids = new Set<string>();
  for (const b of bones) {
    if (ids.has(b.id)) issues.push({ path: `bones`, message: `duplicate bone id: ${b.id}` });
    ids.add(b.id);
  }

  for (const b of bones) {
    if (b.parentId !== null && !ids.has(b.parentId)) {
      issues.push({ path: `bones.${b.id}.parentId`, message: `unknown parent: ${b.parentId}` });
    }
    if (typeof b.length !== "number" || !Number.isFinite(b.length) || b.length < 0) {
      issues.push({ path: `bones.${b.id}.length`, message: "length must be finite and >= 0" });
    }
    if (b.followParentTip != null && typeof b.followParentTip !== "boolean") {
      issues.push({ path: `bones.${b.id}.followParentTip`, message: "followParentTip must be a boolean when set" });
    }
    if (b.followParentTip && b.parentId === null) {
      issues.push({
        path: `bones.${b.id}.followParentTip`,
        message: "followParentTip requires a parent bone",
      });
    }
    if (b.bindBone3d) {
      const d = b.bindBone3d;
      for (const key of ["z", "depthOffset", "tilt", "spin"] as const) {
        const v = d[key];
        if (typeof v !== "number" || !Number.isFinite(v)) {
          issues.push({ path: `bones.${b.id}.bindBone3d.${key}`, message: "must be a finite number" });
        }
      }
    }
  }

  // Cycle detection: walk ancestors from each bone
  for (const b of bones) {
    const seen = new Set<string>();
    let cur: string | null = b.id;
    while (cur !== null) {
      if (seen.has(cur)) {
        issues.push({ path: "bones", message: `cycle in parent chain involving ${b.id}` });
        break;
      }
      seen.add(cur);
      const node = bones.find((x) => x.id === cur);
      cur = node?.parentId ?? null;
    }
  }

  if (!clips.some((c) => c.id === activeClipId)) {
    issues.push({ path: "activeClipId", message: `active clip not found: ${activeClipId}` });
  }

  const ref = project.referenceImage;
  if (ref != null) {
    if (typeof ref.fileName !== "string" || ref.fileName.length === 0) {
      issues.push({ path: "referenceImage.fileName", message: "reference image needs a file name" });
    }
    if (typeof ref.dataBase64 !== "string" || ref.dataBase64.length === 0) {
      issues.push({ path: "referenceImage.dataBase64", message: "reference image payload is empty" });
    }
    const norm = normalizeReferenceImageMime(ref.mimeType);
    if (!norm) {
      issues.push({
        path: "referenceImage.mimeType",
        message: "unsupported reference image type (use PNG, JPEG, or WebP)",
      });
    }
  }

  const meshIds = new Set<string>();
  for (const m of project.skinnedMeshes ?? []) {
    if (meshIds.has(m.id)) {
      issues.push({ path: "skinnedMeshes", message: `duplicate mesh id: ${m.id}` });
    }
    meshIds.add(m.id);
    if (m.assetPath) {
      const hasInline = m.vertices.length > 0 || m.indices.length > 0 || (m.influences?.length ?? 0) > 0;
      if (hasInline) {
        issues.push({
          path: `skinnedMeshes.${m.id}`,
          message: "assetPath cannot be combined with inline mesh geometry",
        });
        continue;
      }
      issues.push({
        path: `skinnedMeshes.${m.id}.assetPath`,
        message: "external mesh not loaded (hydrate folder assets first)",
      });
      continue;
    }
    for (const iss of validateSkinnedMesh(m, ids)) {
      issues.push(iss);
    }
  }

  for (const clip of clips) {
    for (const tr of clip.tracks) {
      if (!ids.has(tr.boneId)) {
        issues.push({ path: `clips.${clip.id}.tracks`, message: `unknown boneId in track: ${tr.boneId}` });
      }
      for (const ch of tr.channels) {
        if (!VALID_EDITOR_CHANNEL_PROPERTIES.includes(ch.property)) {
          issues.push({
            path: `clips.${clip.id}.tracks`,
            message: `unknown channel property: ${ch.property}`,
          });
        }
        for (let i = 1; i < ch.keys.length; i++) {
          if (ch.keys[i]!.t <= ch.keys[i - 1]!.t) {
            issues.push({
              path: `clips.${clip.id}.tracks`,
              message: `keys not strictly increasing for ${tr.boneId}/${ch.property}`,
            });
          }
        }
      }
    }
  }

  const ikChainIds = new Set<string>();
  const sliceIds = new Set<string>();
  const rig = project.characterRig;
  if (rig) {
    const sheets = rig.spriteSheets ?? [];
    const sheetIds = new Set<string>();
    for (const sh of sheets) {
      if (sheetIds.has(sh.id)) {
        issues.push({ path: "characterRig.spriteSheets", message: `duplicate sprite sheet id: ${sh.id}` });
      }
      sheetIds.add(sh.id);
      if (typeof sh.fileName !== "string" || sh.fileName.length === 0) {
        issues.push({ path: `characterRig.spriteSheets.${sh.id}.fileName`, message: "sprite sheet needs a file name" });
      }
      if (typeof sh.dataBase64 !== "string" || sh.dataBase64.length === 0) {
        issues.push({ path: `characterRig.spriteSheets.${sh.id}.dataBase64`, message: "sprite sheet payload is empty" });
      }
      const norm = normalizeReferenceImageMime(sh.mimeType);
      if (!norm) {
        issues.push({
          path: `characterRig.spriteSheets.${sh.id}.mimeType`,
          message: "unsupported sprite sheet type (use PNG, JPEG, or WebP)",
        });
      }
    }
    for (const s of rig.slices) {
      if (sliceIds.has(s.id)) {
        issues.push({ path: "characterRig.slices", message: `duplicate slice id: ${s.id}` });
      }
      sliceIds.add(s.id);
      if (typeof s.name !== "string" || s.name.length === 0) {
        issues.push({ path: `characterRig.slices.${s.id}.name`, message: "slice needs a name" });
      }
      const emptySlot = s.width <= 0 || s.height <= 0;
      if (!emptySlot && (!(s.width > 0) || !(s.height > 0))) {
        issues.push({ path: `characterRig.slices.${s.id}`, message: "slice width/height must be positive when not empty" });
      }
      if (!Number.isFinite(s.worldCx) || !Number.isFinite(s.worldCy)) {
        issues.push({ path: `characterRig.slices.${s.id}`, message: "slice world position must be finite" });
      }
      if (s.viewName != null && (typeof s.viewName !== "string" || s.viewName.length === 0)) {
        issues.push({ path: `characterRig.slices.${s.id}.viewName`, message: "view name must be non-empty when set" });
      }
      if (s.side != null && s.side !== "front" && s.side !== "back") {
        issues.push({ path: `characterRig.slices.${s.id}.side`, message: "side must be front or back" });
      }
      if (emptySlot) {
        continue;
      }
      if (s.embedded && s.sheetId) {
        issues.push({ path: `characterRig.slices.${s.id}`, message: "slice cannot have both embedded and sheetId" });
      }
      if (!s.embedded && !s.sheetId) {
        issues.push({
          path: `characterRig.slices.${s.id}`,
          message: "slice with size needs embedded image or sheetId + rect",
        });
      }
      if (s.embedded) {
        const em = s.embedded;
        const norm = normalizeReferenceImageMime(em.mimeType);
        if (!norm) {
          issues.push({
            path: `characterRig.slices.${s.id}.embedded`,
            message: "unsupported embedded image type (use PNG, JPEG, or WebP)",
          });
        }
        if (typeof em.dataBase64 !== "string" || em.dataBase64.length === 0) {
          issues.push({ path: `characterRig.slices.${s.id}.embedded`, message: "embedded image payload is empty" });
        }
        if (!(em.pixelWidth > 0) || !(em.pixelHeight > 0)) {
          issues.push({ path: `characterRig.slices.${s.id}.embedded`, message: "embedded dimensions invalid" });
        }
        if (em.pixelWidth !== s.width || em.pixelHeight !== s.height) {
          issues.push({
            path: `characterRig.slices.${s.id}`,
            message: "slice size must match embedded image dimensions",
          });
        }
      }
      if (s.embeddedBack) {
        const em = s.embeddedBack;
        const norm = normalizeReferenceImageMime(em.mimeType);
        if (!norm) {
          issues.push({
            path: `characterRig.slices.${s.id}.embeddedBack`,
            message: "unsupported embeddedBack image type (use PNG, JPEG, or WebP)",
          });
        }
        if (typeof em.dataBase64 !== "string" || em.dataBase64.length === 0) {
          issues.push({
            path: `characterRig.slices.${s.id}.embeddedBack`,
            message: "embeddedBack image payload is empty",
          });
        }
        if (!(em.pixelWidth > 0) || !(em.pixelHeight > 0)) {
          issues.push({
            path: `characterRig.slices.${s.id}.embeddedBack`,
            message: "embeddedBack dimensions invalid",
          });
        }
        if (em.pixelWidth !== s.width || em.pixelHeight !== s.height) {
          issues.push({
            path: `characterRig.slices.${s.id}`,
            message: "slice size must match embeddedBack image dimensions",
          });
        }
      }
      if (s.sheetId && !s.embedded) {
        if (!sheetIds.has(s.sheetId)) {
          issues.push({ path: `characterRig.slices.${s.id}.sheetId`, message: "unknown sprite sheet id" });
        } else {
          const sh = sheets.find((x) => x.id === s.sheetId)!;
          const pw = sh.pixelWidth;
          const ph = sh.pixelHeight;
          if (
            typeof pw === "number" &&
            typeof ph === "number" &&
            pw > 0 &&
            ph > 0 &&
            (s.x < 0 || s.y < 0 || s.x + s.width > pw + 1e-6 || s.y + s.height > ph + 1e-6)
          ) {
            issues.push({
              path: `characterRig.slices.${s.id}`,
              message: "slice rect outside sprite sheet bounds",
            });
          }
        }
      }
    }
    const boundSlice = new Set<string>();
    for (const b of rig.bindings) {
      if (!sliceIds.has(b.sliceId)) {
        issues.push({ path: "characterRig.bindings", message: `unknown slice id in binding: ${b.sliceId}` });
      }
      if (!ids.has(b.boneId)) {
        issues.push({ path: "characterRig.bindings", message: `unknown bone id in binding: ${b.boneId}` });
      }
      if (boundSlice.has(b.sliceId)) {
        issues.push({ path: "characterRig.bindings", message: `duplicate binding for slice: ${b.sliceId}` });
      }
      boundSlice.add(b.sliceId);
    }
    const depthSlice = new Set<string>();
    for (const d of rig.sliceDepths ?? []) {
      if (!sliceIds.has(d.sliceId)) {
        issues.push({ path: "characterRig.sliceDepths", message: `unknown slice id in depth: ${d.sliceId}` });
      }
      if (depthSlice.has(d.sliceId)) {
        issues.push({ path: "characterRig.sliceDepths", message: `duplicate depth entry for slice: ${d.sliceId}` });
      }
      depthSlice.add(d.sliceId);

      // Optional depth textures (Smack-style heightmaps) must match slice size.
      const s = rig.slices.find((x) => x.id === d.sliceId);
      const checkTex = (label: "Front" | "Back", tex?: { mimeType: string; dataBase64: string; pixelWidth: number; pixelHeight: number }) => {
        if (!tex) return;
        const norm = normalizeReferenceImageMime(tex.mimeType);
        if (!norm) {
          issues.push({
            path: `characterRig.sliceDepths.${d.sliceId}.depthTexture${label}`,
            message: "unsupported depth texture type (use PNG, JPEG, or WebP)",
          });
        }
        if (typeof tex.dataBase64 !== "string" || tex.dataBase64.length === 0) {
          issues.push({
            path: `characterRig.sliceDepths.${d.sliceId}.depthTexture${label}`,
            message: "depth texture payload is empty",
          });
        }
        if (!(tex.pixelWidth > 0) || !(tex.pixelHeight > 0)) {
          issues.push({
            path: `characterRig.sliceDepths.${d.sliceId}.depthTexture${label}`,
            message: "depth texture dimensions invalid",
          });
        }
        if (s && (tex.pixelWidth !== s.width || tex.pixelHeight !== s.height)) {
          issues.push({
            path: `characterRig.sliceDepths.${d.sliceId}`,
            message: "depth texture size must match slice width/height",
          });
        }
      };
      checkTex("Front", (d as any).depthTextureFront);
      checkTex("Back", (d as any).depthTextureBack);
    }
  }

  for (const ch of project.ikTwoBoneChains ?? []) {
    if (ikChainIds.has(ch.id)) {
      issues.push({ path: "ikTwoBoneChains", message: `duplicate IK chain id: ${ch.id}` });
    }
    ikChainIds.add(ch.id);
    for (const bid of [ch.rootBoneId, ch.midBoneId, ch.tipBoneId]) {
      if (!ids.has(bid)) {
        issues.push({ path: `ikTwoBoneChains.${ch.id}`, message: `unknown bone: ${bid}` });
      }
    }
    const root = bones.find((b) => b.id === ch.rootBoneId);
    const mid = bones.find((b) => b.id === ch.midBoneId);
    const tip = bones.find((b) => b.id === ch.tipBoneId);
    if (root && mid && tip) {
      if (mid.parentId !== root.id) {
        issues.push({ path: `ikTwoBoneChains.${ch.id}`, message: "mid bone must be direct child of root" });
      }
      if (tip.parentId !== mid.id) {
        issues.push({ path: `ikTwoBoneChains.${ch.id}`, message: "tip bone must be direct child of mid" });
      }
    }
  }

  return issues;
}
