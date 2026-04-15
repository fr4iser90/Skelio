import type { EditorProject } from "../types.js";
import { twoBoneIkAbsoluteLocalRotsAtTime } from "./solveTwoBoneChain2d.js";

export type BakeIkToFkRotKeys = {
  /** rot channel value = offset-from-bind (EditorMeta.clipTransformsRelativeToBind semantics). */
  rootRotOffsetFromBind: number;
  /** rot channel value = offset-from-bind (EditorMeta.clipTransformsRelativeToBind semantics). */
  midRotOffsetFromBind: number;
};

function unwrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * Computes rot key values (offset-from-bind) for baking a 2-bone IK chain at a single time.
 *
 * The solver runs in world space; we convert to local rotations by subtracting parent world rotation.
 */
export function bakeIkTwoBoneChainRotKeysAtTime(
  project: EditorProject,
  time: number,
  chainId: string,
): { rootBoneId: string; midBoneId: string; keys: BakeIkToFkRotKeys } | null {
  const rots = twoBoneIkAbsoluteLocalRotsAtTime(project, time, chainId);
  if (!rots) return null;
  const root = project.bones.find((b) => b.id === rots.rootBoneId);
  const mid = project.bones.find((b) => b.id === rots.midBoneId);
  if (!root || !mid) return null;

  // Stored clip channel values are offsets from bind pose.
  const rootRotOffsetFromBind = unwrapAngle(rots.rootLocalRot - root.bindPose.rotation);
  const midRotOffsetFromBind = unwrapAngle(rots.midLocalRot - mid.bindPose.rotation);

  return {
    rootBoneId: root.id,
    midBoneId: mid.id,
    keys: { rootRotOffsetFromBind, midRotOffsetFromBind },
  };
}

