import { describe, expect, it } from "vitest";
import { getBindLocalBoneState, localMat4FromState, mat4ToMat2dProjection, worldBindBoneMatrices4 } from "./bone3dPose.js";
import { createId } from "./ids.js";
import { fromTransform } from "./mat2d.js";
import { transformPointMat4 } from "./mat4.js";
import { createDefaultEditorProject } from "./projectFactory.js";
import { worldBindBoneMatrices, worldBindBoneMatricesOverridingBindPose } from "./pose.js";
import type { Bone } from "./types.js";

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

  it("planar2dNoTiltSpin does not snap when parent.length is 0 (keeps bind x/y off root)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.length = 0;
    root.bindBone3d = { z: 0, depthOffset: 0, tilt: 0.15, spin: 0 };
    const childId = createId("bone");
    const child: Bone = {
      id: childId,
      parentId: root.id,
      name: "arm",
      bindPose: { x: 80, y: -20, rotation: 0, sx: 1, sy: 1 },
      length: 35,
    };
    p.bones.push(child);

    const wbPlanar = worldBindBoneMatrices4(p, { planar2dNoTiltSpin: true });
    const joint = transformPointMat4(wbPlanar.get(childId)!, 0, 0, 0);
    expect(Math.hypot(joint.x, joint.y)).toBeGreaterThan(20);
  });

  it("planar2dNoTiltSpin snaps child tx/ty so parent tip meets child joint (closed 2D chain)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.length = 40;
    root.bindBone3d = { z: 0, depthOffset: 0, tilt: 0.2, spin: 0 };
    const childId = createId("bone");
    const child: Bone = {
      id: childId,
      parentId: root.id,
      name: "arm",
      bindPose: { x: 12, y: 7, rotation: 0, sx: 1, sy: 1 },
      length: 30,
    };
    p.bones.push(child);

    const wbFull = worldBindBoneMatrices4(p);
    const tipFull = transformPointMat4(wbFull.get(root.id)!, root.length, 0, 0);
    const jointFull = transformPointMat4(wbFull.get(childId)!, 0, 0, 0);
    expect(Math.hypot(tipFull.x - jointFull.x, tipFull.y - jointFull.y)).toBeGreaterThan(2);

    const wbPlanar = worldBindBoneMatrices4(p, { planar2dNoTiltSpin: true });
    const tipP = transformPointMat4(wbPlanar.get(root.id)!, root.length, 0, 0);
    const jointP = transformPointMat4(wbPlanar.get(childId)!, 0, 0, 0);
    expect(tipP.x).toBeCloseTo(jointP.x, 5);
    expect(tipP.y).toBeCloseTo(jointP.y, 5);
  });

  it("planar2dNoTiltSpin does not snap when parent has multiple children (branching)", () => {
    const p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.length = 25;
    root.bindBone3d = { z: 0, depthOffset: 0, tilt: 0.1, spin: 0 };
    const aId = createId("bone");
    const bId = createId("bone");
    p.bones.push({
      id: aId,
      parentId: root.id,
      name: "a",
      bindPose: { x: 5, y: 12, rotation: 0, sx: 1, sy: 1 },
      length: 10,
    });
    p.bones.push({
      id: bId,
      parentId: root.id,
      name: "b",
      bindPose: { x: 5, y: -15, rotation: 0, sx: 1, sy: 1 },
      length: 10,
    });
    const wbPlanar = worldBindBoneMatrices4(p, { planar2dNoTiltSpin: true });
    const ja = transformPointMat4(wbPlanar.get(aId)!, 0, 0, 0);
    const jb = transformPointMat4(wbPlanar.get(bId)!, 0, 0, 0);
    expect(Math.hypot(ja.x - jb.x, ja.y - jb.y)).toBeGreaterThan(5);
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
