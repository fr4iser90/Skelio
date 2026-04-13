import { fabrik2dThreeJoints, segmentLengthsFromBoneFields, type Vec2 } from "./ik2d.js";
import type { EditorProject, IkTwoBoneChain } from "./types.js";
import { worldPoseOrigins } from "./pose.js";

/**
 * FK origins, then optional IK chains override joint positions for visualization (FABRIK).
 * Skinned mesh deformation still uses FK matrices unless extended later.
 */
export function worldPoseOriginsWithIk(project: EditorProject, time: number): Map<string, Vec2> {
  const origins = new Map<string, Vec2>();
  for (const [id, p] of worldPoseOrigins(project, time)) {
    origins.set(id, { ...p });
  }

  for (const chain of project.ikTwoBoneChains ?? []) {
    if (!chain.enabled) continue;
    applyIkChain(origins, project, chain);
  }

  return origins;
}

function applyIkChain(
  origins: Map<string, Vec2>,
  project: EditorProject,
  chain: IkTwoBoneChain,
): void {
  const r = chain.rootBoneId;
  const m = chain.midBoneId;
  const t = chain.tipBoneId;
  const p0fk = origins.get(r);
  const p1fk = origins.get(m);
  const p2fk = origins.get(t);
  const boneRoot = project.bones.find((b) => b.id === r);
  const boneMid = project.bones.find((b) => b.id === m);
  if (!p0fk || !p1fk || !p2fk || !boneRoot || !boneMid) return;

  const lengths = segmentLengthsFromBoneFields(boneRoot.length, boneMid.length);
  const target: Vec2 = { x: chain.targetX, y: chain.targetY };
  const { p0, p1, p2 } = fabrik2dThreeJoints(p0fk, p1fk, p2fk, lengths, target, 24);
  origins.set(r, p0);
  origins.set(m, p1);
  origins.set(t, p2);
}
