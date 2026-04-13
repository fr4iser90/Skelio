import { fabrik2dThreeJoints, segmentLengthsFromBindOrigins, type Vec2 } from "./ik2d.js";
import type { EditorProject, IkTwoBoneChain } from "./types.js";
import { worldBindOrigins, worldPoseOrigins } from "./pose.js";

/**
 * FK origins, then optional IK chains override joint positions for visualization (FABRIK).
 * Skinned mesh deformation still uses FK matrices unless extended later.
 */
export function worldPoseOriginsWithIk(project: EditorProject, time: number): Map<string, Vec2> {
  const origins = new Map<string, Vec2>();
  for (const [id, p] of worldPoseOrigins(project, time)) {
    origins.set(id, { ...p });
  }

  const bindO = worldBindOrigins(project);

  for (const chain of project.ikTwoBoneChains ?? []) {
    if (!chain.enabled) continue;
    applyIkChain(origins, bindO, chain);
  }

  return origins;
}

function applyIkChain(
  origins: Map<string, Vec2>,
  bindO: Map<string, { x: number; y: number }>,
  chain: IkTwoBoneChain,
): void {
  const r = chain.rootBoneId;
  const m = chain.midBoneId;
  const t = chain.tipBoneId;
  const p0fk = origins.get(r);
  const p1fk = origins.get(m);
  const p2fk = origins.get(t);
  const b0 = bindO.get(r);
  const b1 = bindO.get(m);
  const b2 = bindO.get(t);
  if (!p0fk || !p1fk || !p2fk || !b0 || !b1 || !b2) return;

  const lengths = segmentLengthsFromBindOrigins(b0, b1, b2);
  const target: Vec2 = { x: chain.targetX, y: chain.targetY };
  const { p0, p1, p2 } = fabrik2dThreeJoints(p0fk, p1fk, p2fk, lengths, target, 24);
  origins.set(r, p0);
  origins.set(m, p1);
  origins.set(t, p2);
}
