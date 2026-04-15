import type { Vec2 } from "./ik2d.js";
import type { EditorProject } from "./types.js";
import { evaluatePose } from "./rig/evaluatePose.js";

/**
 * FK origins, then optional IK chains override joint positions (via {@link evaluatePose} solved matrices).
 */
export function worldPoseOriginsWithIk(project: EditorProject, time: number): Map<string, Vec2> {
  return evaluatePose(project, time, { applyIk: true }).solvedOriginByBoneId;
}
