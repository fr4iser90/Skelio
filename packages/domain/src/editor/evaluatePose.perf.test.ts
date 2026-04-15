import { performance } from "node:perf_hooks";
import { describe, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import type { EditorProject, IkTwoBoneChain } from "./types.js";
import { evaluatePose } from "./rig/evaluatePose.js";
import {
  worldPoseBoneMatrices4,
  worldPoseBoneMatrices4FusedFkAndSolved,
  worldPoseBoneMatrices4WithRotOverrides,
} from "./bone3dPose.js";
import { twoBoneIkAbsoluteLocalRotsAtTime } from "./rig/solveTwoBoneChain2d.js";

const d = process.env.SKELIO_PERF === "1" ? describe : describe.skip;

function buildLinearBonesProject(boneCount: number): EditorProject {
  const p = createDefaultEditorProject();
  const root = p.bones.find((b) => b.parentId === null);
  if (!root) throw new Error("no root bone");

  root.bindPose = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1 };
  root.length = 20;

  // Keep project meta/clips/rig but force a clean linear chain of `boneCount`.
  p.bones = [root];

  for (let i = 1; i < boneCount; i++) {
    const parent = p.bones[i - 1]!;
    p.bones.push({
      id: `bone_${i}`,
      parentId: parent.id,
      name: `b${i}`,
      bindPose: { x: parent.length, y: 0, rotation: 0, sx: 1, sy: 1 },
      length: 20,
      bindBone3d: { z: 0, depthOffset: 0, tilt: 0, spin: 0 },
    });
  }
  return p;
}

function addTwoBoneChains(p: EditorProject, chainCount: number): void {
  const chains: IkTwoBoneChain[] = [];
  const maxStart = Math.max(0, p.bones.length - 3);
  const step = chainCount > 0 ? Math.max(1, Math.floor(maxStart / chainCount)) : 1;
  let start = 0;
  for (let ci = 0; ci < chainCount && start <= maxStart; ci++) {
    const root = p.bones[start]!;
    const mid = p.bones[start + 1]!;
    const tip = p.bones[start + 2]!;
    chains.push({
      id: `ik_${ci}`,
      name: `ik${ci}`,
      enabled: true,
      rootBoneId: root.id,
      midBoneId: mid.id,
      tipBoneId: tip.id,
      targetX: (start + 3) * 10,
      targetY: 40,
      allowStretch: false,
    });
    start += step;
  }
  p.rig ??= {};
  p.rig.ik ??= {};
  p.rig.ik.twoBoneChains = chains;
}

function bench(fn: () => void, iterations: number): { avgMs: number; totalMs: number } {
  for (let i = 0; i < Math.min(10, iterations); i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - t0;
  return { avgMs: totalMs / iterations, totalMs };
}

function heapUsedMb(): number {
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function gcIfAvailable() {
  const g = (globalThis as any).gc as undefined | (() => void);
  if (typeof g === "function") g();
}

function benchWithHeap(fn: () => void, iterations: number): { avgMs: number; heapDeltaMb: number } {
  gcIfAvailable();
  const h0 = heapUsedMb();
  const t = bench(fn, iterations);
  gcIfAvailable();
  const h1 = heapUsedMb();
  return { avgMs: t.avgMs, heapDeltaMb: h1 - h0 };
}

function runCase(bones: number, chains: number) {
  const p = buildLinearBonesProject(bones);
  addTwoBoneChains(p, chains);
  const t = 0.5;
  const iters = bones <= 200 ? 400 : bones <= 600 ? 200 : 100;

  const fk = benchWithHeap(() => evaluatePose(p, t, { applyIk: false }), iters);
  const ik = benchWithHeap(() => evaluatePose(p, t, { applyIk: true }), iters);

  // Rough breakdown pieces (timing only; still allocates, but isolates hotspots).
  const fkWorld = bench(() => {
    worldPoseBoneMatrices4(p, t);
  }, iters);
  const ikRots = bench(() => {
    for (const ch of p.rig?.ik?.twoBoneChains ?? []) {
      if (!ch.enabled) continue;
      twoBoneIkAbsoluteLocalRotsAtTime(p, t, ch.id);
    }
  }, iters);
  const solvedWorld = bench(() => {
    // Compute rotOverrides the same way as evaluatePose would.
    const rotOverrides = new Map<string, number>();
    for (const ch of p.rig?.ik?.twoBoneChains ?? []) {
      if (!ch.enabled) continue;
      const rots = twoBoneIkAbsoluteLocalRotsAtTime(p, t, ch.id);
      if (!rots) continue;
      rotOverrides.set(rots.rootBoneId, rots.rootLocalRot);
      rotOverrides.set(rots.midBoneId, rots.midLocalRot);
    }
    worldPoseBoneMatrices4WithRotOverrides(p, t, rotOverrides);
  }, iters);

  const fusedWorld = bench(() => {
    const rotOverrides = new Map<string, number>();
    for (const ch of p.rig?.ik?.twoBoneChains ?? []) {
      if (!ch.enabled) continue;
      const rots = twoBoneIkAbsoluteLocalRotsAtTime(p, t, ch.id);
      if (!rots) continue;
      rotOverrides.set(rots.rootBoneId, rots.rootLocalRot);
      rotOverrides.set(rots.midBoneId, rots.midLocalRot);
    }
    worldPoseBoneMatrices4FusedFkAndSolved(p, t, rotOverrides);
  }, iters);

  // eslint-disable-next-line no-console
  console.log(
    [
      `bones=${bones}`,
      `chains=${chains}`,
      `iters=${iters}`,
      `FK avg=${fk.avgMs.toFixed(3)}ms (heapΔ=${fk.heapDeltaMb.toFixed(2)}MB)`,
      `IK avg=${ik.avgMs.toFixed(3)}ms (heapΔ=${ik.heapDeltaMb.toFixed(2)}MB)`,
      `breakdown: fkWorld=${fkWorld.avgMs.toFixed(3)}ms ikRots=${ikRots.avgMs.toFixed(3)}ms solvedWorld=${solvedWorld.avgMs.toFixed(3)}ms fusedWorld=${fusedWorld.avgMs.toFixed(3)}ms`,
    ].join(" | "),
  );
}

d("evaluatePose perf bench (manual; set SKELIO_PERF=1)", () => {
  it("reports baseline timings", () => {
    runCase(100, 0);
    runCase(100, 10);
    runCase(500, 0);
    runCase(500, 40);
    runCase(1000, 0);
    runCase(1000, 80);
  });
});

