import type { EditorProject } from "./types.js";

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

  for (const clip of clips) {
    for (const tr of clip.tracks) {
      if (!ids.has(tr.boneId)) {
        issues.push({ path: `clips.${clip.id}.tracks`, message: `unknown boneId in track: ${tr.boneId}` });
      }
      for (const ch of tr.channels) {
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

  return issues;
}
