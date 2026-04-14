import { describe, expect, it } from "vitest";
import { fromTransform } from "./mat2d.js";
import { createDefaultEditorProject } from "./projectFactory.js";
import { worldBindBoneMatrices, worldBindBoneMatricesOverridingBindPose } from "./pose.js";
import { getBindLocalBoneState, localMat4FromState, mat4ToMat2dProjection } from "./bone3dPose.js";

describe("bone3dPose", () => {
  it("without bindBone3d matches classic 2D bind matrix", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    const m2dOld = fromTransform(root.bindPose);
    const m2dNew = worldBindBoneMatrices(p).get(root.id)!;
    expect(m2dNew.a).toBeCloseTo(m2dOld.a, 6);
    expect(m2dNew.b).toBeCloseTo(m2dOld.b, 6);
    expect(m2dNew.c).toBeCloseTo(m2dOld.c, 6);
    expect(m2dNew.d).toBeCloseTo(m2dOld.d, 6);
    expect(m2dNew.e).toBeCloseTo(m2dOld.e, 6);
    expect(m2dNew.f).toBeCloseTo(m2dOld.f, 6);
  });

  it("bindBone3d spin changes projected 2D matrix (Ry mixes X into screen plane)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.bindBone3d = { z: 0, depthOffset: 0, tilt: 0, spin: 0.35 };
    const s = getBindLocalBoneState(root, null, null);
    const m4 = localMat4FromState(s);
    const m2 = mat4ToMat2dProjection(m4);
    const flat = fromTransform(root.bindPose);
    expect(m2.a).not.toBeCloseTo(flat.a, 3);
  });

  it("override bind pose still stacks 3d bind", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.bindBone3d = { z: 1, depthOffset: 0, tilt: 0, spin: 0 };
    const o = worldBindBoneMatricesOverridingBindPose(p, root.id, {
      ...root.bindPose,
      x: 5,
      y: -2,
    }).get(root.id)!;
    expect(o.e).toBeCloseTo(5);
    expect(o.f).toBeCloseTo(-2);
  });
});
