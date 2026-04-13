import { describe, expect, it } from "vitest";
import {
  createDefaultEditorProject,
  createId,
  meshDisplayNameFromFileName,
  skinnedMeshFromObjText,
  validateEditorProject,
} from "@skelio/domain";
import { applyCommand } from "./commands.js";

describe("applyCommand", () => {
  it("adds demo IK chain and validates", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoIkChain" });
    expect(p.bones.length).toBeGreaterThanOrEqual(3);
    expect(p.ikTwoBoneChains?.length).toBe(1);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("sets IK chain target and enabled, then removes chain", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoIkChain" });
    const chainId = p.ikTwoBoneChains![0]!.id;
    p = applyCommand(p, {
      type: "setIkChainTarget",
      chainId,
      targetX: 42,
      targetY: -7,
    });
    expect(p.ikTwoBoneChains![0]!.targetX).toBe(42);
    expect(p.ikTwoBoneChains![0]!.targetY).toBe(-7);
    p = applyCommand(p, { type: "setIkChainEnabled", chainId, enabled: false });
    expect(p.ikTwoBoneChains![0]!.enabled).toBe(false);
    expect(validateEditorProject(p)).toHaveLength(0);
    p = applyCommand(p, { type: "removeIkChain", chainId });
    expect(p.ikTwoBoneChains).toBeUndefined();
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("ignores IK commands for unknown chain id", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoIkChain" });
    const snapshot = structuredClone(p);
    p = applyCommand(p, {
      type: "setIkChainTarget",
      chainId: "chain_missing",
      targetX: 1,
      targetY: 2,
    });
    expect(p.ikTwoBoneChains).toEqual(snapshot.ikTwoBoneChains);
    p = applyCommand(p, { type: "setIkChainEnabled", chainId: "chain_missing", enabled: false });
    expect(p.ikTwoBoneChains).toEqual(snapshot.ikTwoBoneChains);
    const beforeRemove = structuredClone(p);
    p = applyCommand(p, { type: "removeIkChain", chainId: "chain_missing" });
    expect(p.ikTwoBoneChains).toEqual(beforeRemove.ikTwoBoneChains);
  });

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

  it("sets and clears reference image", () => {
    let p = createDefaultEditorProject();
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    p = applyCommand(p, {
      type: "setReferenceImage",
      fileName: "a.png",
      mimeType: "image/png",
      dataBase64: tinyPng,
    });
    expect(p.referenceImage?.mimeType).toBe("image/png");
    expect(validateEditorProject(p)).toHaveLength(0);
    p = applyCommand(p, { type: "clearReferenceImage" });
    expect(p.referenceImage).toBeUndefined();
  });

  it("ignores unsupported reference image mime", () => {
    const p0 = createDefaultEditorProject();
    const p1 = applyCommand(p0, {
      type: "setReferenceImage",
      fileName: "x.gif",
      mimeType: "image/gif",
      dataBase64: "abcd",
    });
    expect(p1).toBe(p0);
  });

  it("adds and clears demo skinned mesh", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoSkinnedMesh" });
    expect(p.skinnedMeshes?.length).toBe(1);
    expect(validateEditorProject(p)).toHaveLength(0);
    p = applyCommand(p, { type: "clearSkinnedMeshes" });
    expect(p.skinnedMeshes).toBeUndefined();
  });

  it("adds mesh from OBJ parse (addSkinnedMesh)", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    const obj = `
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f 1 2 3
    `;
    const parsed = skinnedMeshFromObjText(obj, {
      id: createId("mesh"),
      name: meshDisplayNameFromFileName("tri.obj"),
      boneId: root,
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    p = applyCommand(p, { type: "addSkinnedMesh", mesh: parsed.mesh });
    expect(p.skinnedMeshes?.length).toBe(1);
    expect(p.skinnedMeshes![0]!.name).toBe("tri");
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("sets vertex influences on a mesh", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "addBone", parentId: root, name: "c" });
    const childId = p.bones.find((b) => b.name === "c")!.id;
    const parsed = skinnedMeshFromObjText(
      "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
      { id: "mesh_test", name: "t", boneId: root },
    );
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    p = applyCommand(p, { type: "addSkinnedMesh", mesh: parsed.mesh });
    const meshId = p.skinnedMeshes![0]!.id;
    p = applyCommand(p, {
      type: "setMeshVertexInfluences",
      meshId,
      vertexIndex: 0,
      influences: [
        { boneId: root, weight: 0.5 },
        { boneId: childId, weight: 0.5 },
      ],
    });
    expect(p.skinnedMeshes![0]!.influences[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ boneId: root, weight: expect.any(Number) }),
        expect.objectContaining({ boneId: childId, weight: expect.any(Number) }),
      ]),
    );
    const sum =
      p.skinnedMeshes![0]!.influences[0]!.reduce((s, x) => s + x.weight, 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-3);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("sets multiple vertex influences in one command", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    const parsed = skinnedMeshFromObjText(
      "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
      { id: "m_batch", name: "t", boneId: root },
    );
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    p = applyCommand(p, { type: "addSkinnedMesh", mesh: parsed.mesh });
    const meshId = p.skinnedMeshes![0]!.id;
    p = applyCommand(p, {
      type: "setMeshVerticesInfluences",
      meshId,
      updates: [
        { vertexIndex: 0, influences: [{ boneId: root, weight: 0.2 }] },
        { vertexIndex: 1, influences: [{ boneId: root, weight: 0.7 }] },
      ],
    });
    expect(p.skinnedMeshes![0]!.influences[0]![0]!.weight).toBeCloseTo(0.2, 5);
    expect(p.skinnedMeshes![0]!.influences[1]![0]!.weight).toBeCloseTo(0.7, 5);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("rejects skinned mesh with unknown bone influence", () => {
    let p = createDefaultEditorProject();
    const parsed = skinnedMeshFromObjText("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n", {
      id: createId("mesh"),
      name: "t",
      boneId: "bone_nope",
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    const p2 = applyCommand(p, { type: "addSkinnedMesh", mesh: parsed.mesh });
    expect(p2).toBe(p);
  });
});
