import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { evaluatePose } from "./rig/evaluatePose.js";
import type { Bone } from "./types.js";

describe("evaluatePose", () => {
  it("with applyIk false, solved matches FK", () => {
    const p = createDefaultEditorProject();
    const t = 0;
    const ps = evaluatePose(p, t, { applyIk: false });
    expect(ps.solvedWorld4ByBoneId.size).toBe(ps.fkWorld4ByBoneId.size);
    for (const [id, fk] of ps.fkWorld4ByBoneId) {
      const s = ps.solvedWorld4ByBoneId.get(id)!;
      for (let i = 0; i < 16; i++) expect(s[i]).toBeCloseTo(fk[i]!, 10);
    }
    expect(ps.ikSolvedLocalRotByBoneId.size).toBe(0);
  });

  it("with IK chain, solved rotations differ from FK and origins update", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    const mid = { id: "bone_mid", parentId: root.id, name: "mid", bindPose: { x: 70, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 65 };
    const tip = { id: "bone_tip", parentId: mid.id, name: "tip", bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 0 };
    p.bones.push(mid, tip);
    root.length = 70;
    p.ikTwoBoneChains = [
      { id: "ik_demo", name: "demo", enabled: true, rootBoneId: root.id, midBoneId: mid.id, tipBoneId: tip.id, targetX: 130, targetY: 35 },
    ];
    const t = 0;
    const ps = evaluatePose(p, t, { applyIk: true });
    expect(ps.ikSolvedLocalRotByBoneId.size).toBeGreaterThan(0);
    const fkMid = ps.fkWorld2dByBoneId.get(mid.id)!;
    const sMid = ps.solvedWorld2dByBoneId.get(mid.id)!;
    const diff = Math.abs(fkMid.a - sMid.a) + Math.abs(fkMid.b - sMid.b);
    expect(diff).toBeGreaterThan(1e-6);
    expect(ps.solvedOriginByBoneId.get(mid.id)!.x).toBeCloseTo(ps.solvedWorld2dByBoneId.get(mid.id)!.e, 5);
  });

  it("skips planar two-bone IK when a chain bone has tilt or spin (incompatible with 2D solver)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    const mid: Bone = {
      id: "bone_mid",
      parentId: root.id,
      name: "mid",
      bindPose: { x: 70, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 65,
      bindBone3d: { tilt: 0.15, spin: 0, z: 0, depthOffset: 0 },
    };
    const tip: Bone = { id: "bone_tip", parentId: mid.id, name: "tip", bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 0 };
    p.bones.push(mid, tip);
    root.length = 70;
    p.ikTwoBoneChains = [
      { id: "ik_demo", name: "demo", enabled: true, rootBoneId: root.id, midBoneId: mid.id, tipBoneId: tip.id, targetX: 130, targetY: 35 },
    ];
    const ps = evaluatePose(p, 0, { applyIk: true });
    expect(ps.ikSolvedLocalRotByBoneId.size).toBe(0);
    for (const [id, fk] of ps.fkWorld4ByBoneId) {
      const s = ps.solvedWorld4ByBoneId.get(id)!;
      for (let i = 0; i < 16; i++) expect(s[i]).toBeCloseTo(fk[i]!, 10);
    }
  });

  it("planar2dNoTiltSpin: IK runs with bind tilt and FK omits tilt/spin", () => {
    const p = createDefaultEditorProject();
    const root = p.bones.find((b) => b.parentId === null)!;
    const mid: Bone = {
      id: "bone_mid",
      parentId: root.id,
      name: "mid",
      bindPose: { x: 70, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 65,
      bindBone3d: { tilt: 0.15, spin: 0, z: 0, depthOffset: 0 },
    };
    const tip: Bone = { id: "bone_tip", parentId: mid.id, name: "tip", bindPose: { x: 65, y: 0, rotation: 0, sx: 1, sy: 1 }, length: 0 };
    p.bones.push(mid, tip);
    root.length = 70;
    p.ikTwoBoneChains = [
      { id: "ik_demo", name: "demo", enabled: true, rootBoneId: root.id, midBoneId: mid.id, tipBoneId: tip.id, targetX: 130, targetY: 35 },
    ];
    const psFull = evaluatePose(p, 0, { applyIk: true });
    const psFlat = evaluatePose(p, 0, { applyIk: true, planar2dNoTiltSpin: true });
    expect(psFull.ikSolvedLocalRotByBoneId.size).toBe(0);
    expect(psFlat.ikSolvedLocalRotByBoneId.size).toBeGreaterThan(0);
    const mFull = psFull.fkWorld4ByBoneId.get(mid.id)!;
    const mFlat = psFlat.fkWorld4ByBoneId.get(mid.id)!;
    let diff = 0;
    for (let i = 0; i < 16; i++) diff += Math.abs(mFull[i]! - mFlat[i]!);
    expect(diff).toBeGreaterThan(1e-6);
  });
});
