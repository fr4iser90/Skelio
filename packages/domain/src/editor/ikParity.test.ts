import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { bakeIkTwoBoneChainRotKeysAtTime } from "./rig/bakeIkToFk.js";
import { solveTwoBoneChain2dAtTime } from "./rig/solveTwoBoneChain2d.js";

describe("IK parity", () => {
  it("preview solve (chain2d) matches bake solver angles", () => {
    const p = createDefaultEditorProject();
    // Reuse app-layer demo helper semantics: create minimal 3-bone chain manually.
    const root = p.bones.find((b) => b.parentId === null)!;
    const mid = { id: "bone_mid", parentId: root.id, name: "mid", bindPose: { x: 70, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 65 };
    const tip = { id: "bone_tip", parentId: mid.id, name: "tip", bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 0 };
    p.bones.push(mid, tip);
    root.length = 70;
    p.ikTwoBoneChains = [
      { id: "ik_demo", name: "demo", enabled: true, rootBoneId: root.id, midBoneId: mid.id, tipBoneId: tip.id, targetX: 130, targetY: 35 },
    ];
    // Ensure rig migration path doesn't matter.
    p.rig = { ik: { twoBoneChains: structuredClone(p.ikTwoBoneChains) } };

    const t = 0;
    const solved = solveTwoBoneChain2dAtTime(p, t, "ik_demo")!;
    const baked = bakeIkTwoBoneChainRotKeysAtTime(p, t, "ik_demo")!;

    // Reconstruct local rotations implied by solver and check baked offsets match.
    const parentWorld = 0; // root has no parent in default project
    const rootLocal = solved.solved.rootWorldAngle - parentWorld;
    const midLocal = solved.solved.midWorldAngle - solved.solved.rootWorldAngle;

    expect(baked.rootBoneId).toBe(root.id);
    expect(baked.midBoneId).toBe(mid.id);
    expect(baked.keys.rootRotOffsetFromBind).toBeCloseTo(rootLocal - root.bindPose.rotation, 6);
    expect(baked.keys.midRotOffsetFromBind).toBeCloseTo(midLocal - mid.bindPose.rotation, 6);
  });
});

