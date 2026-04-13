import { describe, expect, it } from "vitest";
import { createDefaultEditorProject, validateEditorProject } from "@skelio/domain";
import { applyCommand } from "./commands.js";

describe("applyCommand", () => {
  it("adds bone and validates", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "addBone", parentId: root, name: "child" });
    expect(p.bones.length).toBe(2);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("adds keyframe", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "addKeyframe", boneId: root, property: "tx", t: 0, v: 0 });
    p = applyCommand(p, { type: "addKeyframe", boneId: root, property: "tx", t: 1, v: 100 });
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    const tr = clip.tracks.find((t) => t.boneId === root)!;
    const ch = tr.channels.find((c) => c.property === "tx")!;
    expect(ch.keys.length).toBe(2);
  });
});
