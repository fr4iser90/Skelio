import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import {
  BONE_LENGTH_HIT_MIN_LOCAL,
  boneLengthAndBindRotationFromWorldTip,
  boneLengthFromWorldPointer,
  childBindTranslationAtParentTip,
  localBindTranslationForWorldOrigin,
  localTranslationForWorldJointAtPoseTime,
  worldBindBoneMatrices,
  worldBindBoneTipForLengthHit,
  worldBindBoneTips,
  worldBindOrigins,
} from "./pose.js";

describe("localBindTranslationForWorldOrigin", () => {
  it("places child bone world origin via parent inverse", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    p.bones.push({
      id: "bone_child_test",
      parentId: root.id,
      name: "child",
      bindPose: { x: 10, y: 20, rotation: 0, sx: 1, sy: 1 },
      length: 40,
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

describe("localTranslationForWorldJointAtPoseTime", () => {
  it("maps root to world coordinates at any time", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    const r = localTranslationForWorldJointAtPoseTime(p, root.id, 0.5, 3, -4);
    expect(r).toEqual({ x: 3, y: -4 });
  });
});

describe("worldBindBoneTipForLengthHit", () => {
  it("extends past zero length for picking", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.length = 0;
    const t0 = worldBindBoneTips(p).get(root.id)!;
    expect(t0.x).toBeCloseTo(0, 5);
    const th = worldBindBoneTipForLengthHit(p, root.id)!;
    expect(th.x).toBeCloseTo(BONE_LENGTH_HIT_MIN_LOCAL, 5);
  });
});

describe("childBindTranslationAtParentTip", () => {
  it("returns parent tip in parent bone-local space", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.length = 42;
    const t = childBindTranslationAtParentTip(p, root.id);
    expect(t!.x).toBeCloseTo(42, 5);
    expect(t!.y).toBeCloseTo(0, 5);
  });
});

describe("bone length / tip", () => {
  it("bind tip lies length along local +X; pointer projects to length", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.length = 50;
    const tips = worldBindBoneTips(p);
    const t = tips.get(root.id)!;
    expect(t.x).toBeCloseTo(50, 5);
    expect(t.y).toBeCloseTo(0, 5);
    const W = worldBindBoneMatrices(p).get(root.id)!;
    expect(boneLengthFromWorldPointer(W, 30, 0)).toBeCloseTo(30, 5);
    expect(boneLengthFromWorldPointer(W, -10, 0)).toBe(0);
  });

  it("tip drag aims bone at pointer (length + rotation)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.bindPose = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1 };
    root.length = 10;
    const up = boneLengthAndBindRotationFromWorldTip(p, root.id, 0, 40)!;
    expect(up.length).toBeCloseTo(40, 5);
    expect(up.rotation).toBeCloseTo(Math.PI / 2, 5);
    const left = boneLengthAndBindRotationFromWorldTip(p, root.id, -25, 0)!;
    expect(left.length).toBeCloseTo(25, 5);
    expect(left.rotation).toBeCloseTo(Math.PI, 5);
  });

  it("tip drag uses preview bind pose for stable joint basis", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.bindPose = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1 };
    root.length = 20;
    const preview = { ...root.bindPose, rotation: Math.PI / 2 };
    const r = boneLengthAndBindRotationFromWorldTip(p, root.id, 30, 0, preview)!;
    expect(r.length).toBeCloseTo(30, 5);
    expect(r.rotation).toBeCloseTo(0, 5);
  });

  it("tip drag jointWorldFix measures length from the fixed pivot, not apply(W,0,0) with preview", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.length = 40;
    p.bones.push({
      id: "child_len_fix",
      parentId: root.id,
      name: "child",
      bindPose: { x: 40, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 30,
    });
    const child = p.bones.find((b) => b.id === "child_len_fix")!;
    const J = worldBindOrigins(p).get(child.id)!;
    const wx = 80;
    const wy = 10;
    const previewSpin = { ...child.bindPose, rotation: Math.PI / 3 };
    const withFix = boneLengthAndBindRotationFromWorldTip(p, child.id, wx, wy, previewSpin, J)!;
    expect(withFix.length).toBeCloseTo(Math.hypot(wx - J.x, wy - J.y), 5);
  });

  it("tip drag for child under rotated parent aims world +X at pointer (parent chain, not local+delta)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    root.bindPose = { x: 0, y: 0, rotation: Math.PI / 2, sx: 1, sy: 1 };
    root.length = 10;
    p.bones.push({
      id: "child_rot_parent",
      parentId: root.id,
      name: "child",
      bindPose: { x: 10, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 20,
    });
    const child = p.bones.find((b) => b.id === "child_rot_parent")!;
    const J = worldBindOrigins(p).get(child.id)!;
    const r = boneLengthAndBindRotationFromWorldTip(p, child.id, J.x + 35, J.y, undefined, J)!;
    expect(r.length).toBeCloseTo(35, 5);
    child.bindPose.rotation = r.rotation;
    const W = worldBindBoneMatrices(p).get(child.id)!;
    expect(Math.atan2(W.b, W.a)).toBeCloseTo(0, 4);
  });
});
