import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { localBindTranslationForWorldOrigin, worldBindOrigins } from "./pose.js";

describe("localBindTranslationForWorldOrigin", () => {
  it("places child bone world origin via parent inverse", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    p.bones.push({
      id: "bone_child_test",
      parentId: root.id,
      name: "child",
      bindPose: { x: 10, y: 20, rotation: 0, sx: 1, sy: 1 },
    });
    const child = p.bones.find((b) => b.id === "bone_child_test")!;
    const originsBefore = worldBindOrigins(p);
    const o0 = originsBefore.get(child.id)!;
    const local = localBindTranslationForWorldOrigin(p, child.id, o0.x + 5, o0.y - 3);
    expect(local).not.toBeNull();
    child.bindPose.x = local!.x;
    child.bindPose.y = local!.y;
    const originsAfter = worldBindOrigins(p);
    const o1 = originsAfter.get(child.id)!;
    expect(o1.x).toBeCloseTo(o0.x + 5, 5);
    expect(o1.y).toBeCloseTo(o0.y - 3, 5);
  });

  it("maps root target to bindPose x y", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    const local = localBindTranslationForWorldOrigin(p, root.id, 99, -12);
    expect(local).toEqual({ x: 99, y: -12 });
  });
});
