import { describe, expect, it } from "vitest";
import {
  createDefaultEditorProject,
  createId,
  editorProjectToRuntime,
  getCharacterRig,
  getLocalBoneState,
  meshDisplayNameFromFileName,
  normalizeEditorProjectInPlace,
  skinnedMeshFromObjText,
  validateEditorProject,
  type EditorProject,
} from "@skelio/domain";
import { applyCommand } from "./commands.js";

function rig(p: EditorProject) {
  const r = getCharacterRig(p);
  if (!r) throw new Error("expected character rig");
  return r;
}

describe("applyCommand", () => {
  it("normalizeEditorProjectInPlace converts legacy absolute tx keys to bind-relative offsets", () => {
    const p = createDefaultEditorProject();
    delete (p.meta as { clipTransformsRelativeToBind?: boolean }).clipTransformsRelativeToBind;
    const root = p.bones[0]!;
    root.bindPose.x = 10;
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    clip.tracks = [
      {
        boneId: root.id,
        channels: [{ property: "tx", interpolation: "linear", keys: [{ t: 0, v: 10 }] }],
      },
    ];
    normalizeEditorProjectInPlace(p);
    expect(p.meta.clipTransformsRelativeToBind).toBe(true);
    const v = clip.tracks[0]!.channels[0]!.keys[0]!.v;
    expect(v).toBe(0);
    expect(getLocalBoneState(root, clip, 0).x).toBe(10);
  });

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

  it("bakes IK chain to FK rot keys", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoIkChain" });
    const chainId = p.ikTwoBoneChains![0]!.id;
    p = applyCommand(p, { type: "bakeIkToFk", chainId, sampleTimes: [0] });
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    const rootId = p.ikTwoBoneChains![0]!.rootBoneId;
    const midId = p.ikTwoBoneChains![0]!.midBoneId;
    const rootRotKeys =
      clip.tracks.find((t) => t.boneId === rootId)?.channels.find((c) => c.property === "rot")?.keys ?? [];
    const midRotKeys =
      clip.tracks.find((t) => t.boneId === midId)?.channels.find((c) => c.property === "rot")?.keys ?? [];
    expect(rootRotKeys.length).toBe(1);
    expect(midRotKeys.length).toBe(1);
    expect(Number.isFinite(rootRotKeys[0]!.v)).toBe(true);
    expect(Number.isFinite(midRotKeys[0]!.v)).toBe(true);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("creates IK target control and keys it", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, { type: "addDemoIkChain" });
    const chainId = p.ikTwoBoneChains![0]!.id;
    p = applyCommand(p, { type: "ensureIkTargetControl", chainId });
    const ctl = p.rig?.controls?.ikTargets2d?.find((c) => c.chainId === chainId);
    expect(ctl).toBeTruthy();
    const t = 0.5;
    p = applyCommand(p, { type: "addIkTargetControlKeyframe", controlId: ctl!.id, property: "x", t, v: 200 });
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    const keys =
      clip.controlTracks?.find((tr) => tr.controlId === ctl!.id)?.channels.find((ch) => ch.property === "x")?.keys ?? [];
    expect(keys).toHaveLength(1);
    expect(keys[0]!.v).toBe(200);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("patches character rig slice meta and validates", () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let p = createDefaultEditorProject();
    p = applyCommand(p, {
      type: "addCharacterRigImportedSprite",
      name: "a",
      mimeType: "image/png",
      dataBase64: tinyPng,
      pixelWidth: 1,
      pixelHeight: 1,
    });
    const sid = rig(p).slices[0]!.id;
    p = applyCommand(p, {
      type: "patchCharacterRigSlice",
      sliceId: sid,
      side: "back",
    });
    expect(rig(p).slices[0]?.side).toBe("back");
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("setCharacterRigSliceLayerPixels sets embeddedBack; clearCharacterRigSliceEmbeddedBack", () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let p = createDefaultEditorProject();
    p = applyCommand(p, {
      type: "addCharacterRigImportedSprite",
      name: "a",
      mimeType: "image/png",
      dataBase64: tinyPng,
      pixelWidth: 1,
      pixelHeight: 1,
    });
    const sid = rig(p).slices[0]!.id;
    p = applyCommand(p, {
      type: "setCharacterRigSliceLayerPixels",
      sliceId: sid,
      layer: "back",
      image: { mimeType: "image/png", dataBase64: tinyPng, pixelWidth: 1, pixelHeight: 1 },
    });
    expect(rig(p).slices[0]?.embeddedBack?.pixelWidth).toBe(1);
    expect(validateEditorProject(p)).toHaveLength(0);
    p = applyCommand(p, { type: "clearCharacterRigSliceEmbeddedBack", sliceId: sid });
    expect(rig(p).slices[0]?.embeddedBack).toBeUndefined();
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("adds imported character rig sprite (embedded) and validates", () => {
    const tinyPng =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    let p = createDefaultEditorProject();
    p = applyCommand(p, {
      type: "addCharacterRigImportedSprite",
      name: "hand",
      mimeType: "image/png",
      dataBase64: tinyPng,
      pixelWidth: 1,
      pixelHeight: 1,
    });
    expect(rig(p).slices).toHaveLength(1);
    expect(rig(p).slices?.[0]?.embedded?.pixelWidth).toBe(1);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("sets character rig sheet and slice, validates", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, {
      type: "setCharacterRigSpriteSheet",
      fileName: "sheet.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 1,
      pixelHeight: 1,
    });
    expect(rig(p).spriteSheets).toHaveLength(1);
    expect(rig(p).spriteSheets?.[0]?.fileName).toBe("sheet.png");
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "head",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
    expect(rig(p).slices).toHaveLength(1);
    expect(rig(p).bindings).toEqual([]);
    expect(validateEditorProject(p)).toHaveLength(0);
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "setCharacterRigBinding", sliceId: rig(p).slices[0]!.id, boneId: root });
    expect(rig(p).bindings).toHaveLength(1);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("setCharacterRigSliceWorldPosition updates binding locals when slice is bound", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setCharacterRigSpriteSheet",
      fileName: "s.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 1,
      pixelHeight: 1,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "A",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      worldCx: 5,
      worldCy: -3,
    });
    const sid = rig(p).slices[0]!.id;
    p = applyCommand(p, { type: "setCharacterRigBinding", sliceId: sid, boneId: root });
    const locBefore = { ...rig(p).bindings![0]! };
    p = applyCommand(p, { type: "setCharacterRigSliceWorldPosition", sliceId: sid, worldCx: 20, worldCy: 10 });
    expect(rig(p).slices[0]!.worldCx).toBe(20);
    expect(rig(p).slices[0]!.worldCy).toBe(10);
    const b = rig(p).bindings![0]!;
    expect(b.localX).not.toBe(locBefore.localX);
    expect(b.localY).not.toBe(locBefore.localY);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("reorderCharacterRigSlice moves slice before another or to end", () => {
    let p = createDefaultEditorProject();
    p = applyCommand(p, {
      type: "setCharacterRigSpriteSheet",
      fileName: "s.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 1,
      pixelHeight: 1,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "A",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      worldCx: 0,
      worldCy: 0,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "B",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      worldCx: 0,
      worldCy: 0,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "C",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      worldCx: 0,
      worldCy: 0,
    });
    const [idA, , idC] = rig(p).slices.map((s) => s.id);
    p = applyCommand(p, { type: "reorderCharacterRigSlice", sliceId: idC, insertBeforeSliceId: idA });
    expect(rig(p).slices.map((s) => s.name).join(",")).toBe("C,A,B");
    p = applyCommand(p, { type: "reorderCharacterRigSlice", sliceId: idA, insertBeforeSliceId: null });
    expect(rig(p).slices.map((s) => s.name).join(",")).toBe("C,B,A");
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("syncCharacterRigSkinnedMeshes builds partial meshes when bindings are incomplete", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "addCharacterRigSpriteSheet",
      fileName: "sheet.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 64,
      pixelHeight: 64,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "A",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      worldCx: 0,
      worldCy: 0,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "B",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      worldCx: 0,
      worldCy: 0,
    });
    p = applyCommand(p, { type: "setCharacterRigBinding", sliceId: rig(p).slices[0]!.id, boneId: root });
    const before = p.skinnedMeshes?.length ?? 0;
    p = applyCommand(p, { type: "syncCharacterRigSkinnedMeshes" });
    expect(p.skinnedMeshes?.length ?? 0).toBeGreaterThan(before);
  });

  it("syncCharacterRigSkinnedMeshes is a no-op when bindings reference unknown bones", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setCharacterRigSpriteSheet",
      fileName: "sheet.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 64,
      pixelHeight: 64,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "Part",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      worldCx: 0,
      worldCy: 0,
    });
    const sid = rig(p).slices[0]!.id;
    p = applyCommand(p, { type: "setCharacterRigBinding", sliceId: sid, boneId: root });
    p = applyCommand(p, { type: "syncCharacterRigSkinnedMeshes" });
    expect(p.skinnedMeshes?.some((m) => m.id.startsWith("rig_slice_"))).toBe(true);
    rig(p).bindings = [{ sliceId: sid, boneId: "no_such_bone" }];
    const n = p.skinnedMeshes?.length ?? 0;
    const beforeBindings = structuredClone(rig(p).bindings);
    p = applyCommand(p, { type: "syncCharacterRigSkinnedMeshes" });
    expect(rig(p).bindings).toEqual(beforeBindings);
    expect(p.skinnedMeshes?.length).toBe(n);
    expect(validateEditorProject(p).some((i) => i.message.includes("unknown bone id in binding"))).toBe(true);
  });

  it("syncCharacterRigSkinnedMeshes creates rig_slice meshes from bound slices", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setCharacterRigSpriteSheet",
      fileName: "sheet.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pixelWidth: 64,
      pixelHeight: 64,
    });
    p = applyCommand(p, {
      type: "addCharacterRigSlice",
      name: "Part",
      x: 0,
      y: 0,
      width: 20,
      height: 10,
      worldCx: 0,
      worldCy: 0,
    });
    const sid = rig(p).slices[0]!.id;
    p = applyCommand(p, { type: "setCharacterRigBinding", sliceId: sid, boneId: root });
    p = applyCommand(p, { type: "syncCharacterRigSkinnedMeshes" });
    expect(p.skinnedMeshes?.length).toBe(1);
    expect(p.skinnedMeshes![0]!.id.startsWith("rig_slice_")).toBe(true);
    expect(p.skinnedMeshes![0]!.vertices.length).toBeGreaterThan(8);
    const depth = rig(p).sliceDepths.find((d) => d.sliceId === sid);
    expect(depth?.maxDepthFront).toBeGreaterThan(0);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("setBoneTranslationKeysAtTime writes tx and ty keys in one command", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setBoneTranslationKeysAtTime",
      boneId: root,
      t: 0.25,
      x: 12,
      y: -7,
    });
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    const tr = clip.tracks.find((t) => t.boneId === root)!;
    const tx = tr.channels.find((c) => c.property === "tx")!.keys;
    const ty = tr.channels.find((c) => c.property === "ty")!.keys;
    expect(tx.some((k) => Math.abs(k.t - 0.25) < 1e-9 && k.v === 12)).toBe(true);
    expect(ty.some((k) => Math.abs(k.t - 0.25) < 1e-9 && k.v === -7)).toBe(true);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("purgeClipTranslationRotationKeysAtTime removes tx/ty/rot keys at t without changing rest pose", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!;
    root.bindPose.x = 49;
    root.bindPose.y = 588;
    const clip = p.clips.find((c) => c.id === p.activeClipId)!;
    /** Offsets from bind: zeros mean rest at bind (49, 588). */
    clip.tracks = [
      {
        boneId: root.id,
        channels: [
          { property: "tx", interpolation: "linear", keys: [{ t: 0, v: 0 }] },
          { property: "ty", interpolation: "linear", keys: [{ t: 0, v: 0 }] },
        ],
      },
    ];
    const s0 = getLocalBoneState(root, clip, 0);
    expect(s0.x).toBe(49);
    expect(s0.y).toBe(588);
    p = applyCommand(p, { type: "purgeClipTranslationRotationKeysAtTime", t: 0 });
    const clip2 = p.clips.find((c) => c.id === p.activeClipId)!;
    const s1 = getLocalBoneState(root, clip2, 0);
    expect(s1.x).toBe(49);
    expect(s1.y).toBe(588);
    expect(clip2.tracks.length).toBe(0);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("setBindBone3d merges; tz keyframe validates; runtime export strips tz/tilt/spin", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setBindBone3d",
      boneId: root,
      partial: { z: 2, depthOffset: 0.5, tilt: 0, spin: 0 },
    });
    expect(p.bones[0]!.bindBone3d?.z).toBe(2);
    expect(p.bones[0]!.bindBone3d?.depthOffset).toBe(0.5);
    p = applyCommand(p, { type: "addKeyframe", boneId: root, property: "tz", t: 0, v: 3 });
    p = applyCommand(p, { type: "addKeyframe", boneId: root, property: "tilt", t: 0, v: 0.1 });
    expect(validateEditorProject(p)).toHaveLength(0);
    const rt = editorProjectToRuntime(p);
    const tracks = rt.animations[0]?.tracks ?? [];
    const allCh = tracks.flatMap((t) => t.channels);
    const props = allCh.map((c) => c.property as string);
    expect(props).not.toContain("tz");
    expect(props).not.toContain("tilt");
    expect(props).not.toContain("spin");
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
    expect(p.bones.find((b) => b.name === "child")?.length).toBe(40);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("sets bone length and rejects invalid values", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "addBone", parentId: root, name: "arm" });
    const bid = p.bones.find((b) => b.name === "arm")!.id;
    p = applyCommand(p, { type: "setBoneLength", boneId: bid, length: 88 });
    expect(p.bones.find((b) => b.id === bid)!.length).toBe(88);
    expect(validateEditorProject(p)).toHaveLength(0);
    const before = structuredClone(p);
    expect(applyCommand(p, { type: "setBoneLength", boneId: bid, length: -2 })).toEqual(before);
  });

  it("sets bone length and bind rotation in one step", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, {
      type: "setBoneLengthAndBindRotation",
      boneId: root,
      length: 55,
      rotation: 1.23,
    });
    const b = p.bones.find((x) => x.id === root)!;
    expect(b.length).toBe(55);
    expect(b.bindPose.rotation).toBeCloseTo(1.23, 5);
    expect(validateEditorProject(p)).toHaveLength(0);
    const before = structuredClone(p);
    expect(
      applyCommand(p, { type: "setBoneLengthAndBindRotation", boneId: root, length: -1, rotation: 0 }),
    ).toEqual(before);
  });

  it("places new child at parent tip when parent has length", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!;
    p = applyCommand(p, { type: "setBoneLength", boneId: root.id, length: 100 });
    p = applyCommand(p, { type: "addBone", parentId: root.id, name: "tip", placeAtParentTip: true });
    expect(p.bones.find((b) => b.name === "tip")!.bindPose.x).toBeCloseTo(100, 5);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("places new child at parent tip when parent length is zero", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!;
    p = applyCommand(p, { type: "setBoneLength", boneId: root.id, length: 0 });
    p = applyCommand(p, { type: "addBone", parentId: root.id, name: "child", placeAtParentTip: true });
    expect(p.bones.find((b) => b.name === "child")!.bindPose.x).toBeCloseTo(0, 5);
    expect(p.bones.find((b) => b.name === "child")!.bindPose.y).toBeCloseTo(0, 5);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("addBone with placeAtParentTip false keeps classic offset", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "setBoneLength", boneId: root, length: 200 });
    p = applyCommand(p, { type: "addBone", parentId: root, name: "c", placeAtParentTip: false });
    expect(p.bones.find((b) => b.name === "c")!.bindPose.x).toBe(40);
  });

  it("snapBoneToParentTip and followParentTip sync on parent length", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!;
    p = applyCommand(p, { type: "setBoneLength", boneId: root.id, length: 80 });
    p = applyCommand(p, { type: "addBone", parentId: root.id, name: "arm", placeAtParentTip: true });
    const armId = p.bones.find((b) => b.name === "arm")!.id;
    p = applyCommand(p, { type: "setBoneLength", boneId: armId, length: 60 });
    p = applyCommand(p, { type: "addBone", parentId: armId, name: "hand" });
    const handId = p.bones.find((b) => b.name === "hand")!.id;
    p = applyCommand(p, { type: "snapBoneToParentTip", boneId: handId });
    expect(p.bones.find((b) => b.id === handId)!.bindPose.x).toBeCloseTo(60, 5);
    p = applyCommand(p, { type: "setBoneFollowParentTip", boneId: handId, follow: true });
    p = applyCommand(p, { type: "setBoneLength", boneId: armId, length: 30 });
    expect(p.bones.find((b) => b.id === handId)!.bindPose.x).toBeCloseTo(30, 5);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("manual bind X clears followParentTip", () => {
    let p = createDefaultEditorProject();
    const root = p.bones[0]!.id;
    p = applyCommand(p, { type: "addBone", parentId: root, name: "c" });
    const childId = p.bones.find((b) => b.name === "c")!.id;
    p = applyCommand(p, { type: "setBoneFollowParentTip", boneId: childId, follow: true });
    p = applyCommand(p, { type: "setBindPose", boneId: childId, partial: { x: 5 } });
    expect(p.bones.find((b) => b.id === childId)!.followParentTip).toBe(false);
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

  it("adds animation clips and switches active", () => {
    let p = createDefaultEditorProject();
    const mainId = p.activeClipId;
    p = applyCommand(p, { type: "addAnimationClip", name: "Idle" });
    expect(p.clips).toHaveLength(2);
    const idleId = p.clips.find((c) => c.name === "Idle")!.id;
    expect(p.activeClipId).toBe(idleId);
    p = applyCommand(p, { type: "setActiveClip", clipId: mainId });
    expect(p.activeClipId).toBe(mainId);
    p = applyCommand(p, { type: "removeAnimationClip", clipId: idleId });
    expect(p.clips).toHaveLength(1);
    expect(validateEditorProject(p)).toHaveLength(0);
  });

  it("rejects importAnimationClip when track references unknown bone", () => {
    const p = createDefaultEditorProject();
    const p2 = applyCommand(p, {
      type: "importAnimationClip",
      clip: { id: "x", name: "x", tracks: [{ boneId: "bone_unknown", channels: [] }] },
    });
    expect(p2).toEqual(p);
  });
});
