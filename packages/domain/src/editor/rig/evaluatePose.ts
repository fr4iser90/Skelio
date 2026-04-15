import type { Vec2 } from "../ik2d.js";
import type { Mat2D } from "../mat2d.js";
import type { Mat4 } from "../mat4.js";
import {
  mat4ToMat2dProjection,
  worldOriginFromMat4,
  worldPoseBoneMatrices4FusedFkAndSolved,
} from "../bone3dPose.js";
import type { EditorProject } from "../types.js";
import { getTwoBoneIkChains } from "./accessors.js";
import { twoBoneIkAbsoluteLocalRotsAtTime } from "./solveTwoBoneChain2d.js";
import type { EvaluatePoseOptions, PoseState } from "./types.js";

function cloneOrigins(src: Map<string, Vec2>): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  for (const [id, p] of src) out.set(id, { x: p.x, y: p.y });
  return out;
}

function mat4MapTo2d(m4: Map<string, Mat4>): Map<string, Mat2D> {
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) {
    out.set(id, mat4ToMat2dProjection(m));
  }
  return out;
}

function originsFromWorld4(m4: Map<string, Mat4>): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  for (const [id, m] of m4) {
    const o = worldOriginFromMat4(m);
    out.set(id, { x: o.x, y: o.y });
  }
  return out;
}

/**
 * Deterministic pose evaluation entrypoint (editor rig pipeline).
 *
 * Pipeline:
 * - FK: sample active clip → world 4×4 chain → 2D projection + origins
 * - IK: 2-bone chains inject solved local rotations on root/mid → rebuild world chain
 * - Constraints/Limits: future (operate on {@link PoseState})
 */
export function evaluatePose(project: EditorProject, time: number, opts?: EvaluatePoseOptions): PoseState {
  const applyIk = opts?.applyIk ?? true;
  const ikSolvedLocalRotByBoneId = new Map<string, number>();
  const rotOverrides = new Map<string, number>();

  if (applyIk) {
    for (const chain of getTwoBoneIkChains(project)) {
      if (!chain.enabled) continue;
      const rots = twoBoneIkAbsoluteLocalRotsAtTime(project, time, chain.id);
      if (!rots) continue;
      rotOverrides.set(rots.rootBoneId, rots.rootLocalRot);
      rotOverrides.set(rots.midBoneId, rots.midLocalRot);
      ikSolvedLocalRotByBoneId.set(rots.rootBoneId, rots.rootLocalRot);
      ikSolvedLocalRotByBoneId.set(rots.midBoneId, rots.midLocalRot);
    }
  }

  const { fkWorld4ByBoneId, solvedWorld4ByBoneId } = worldPoseBoneMatrices4FusedFkAndSolved(
    project,
    time,
    rotOverrides,
  );
  const fkWorld2dByBoneId = mat4MapTo2d(fkWorld4ByBoneId);
  const fkOriginByBoneId = cloneOrigins(originsFromWorld4(fkWorld4ByBoneId));

  const solvedWorld2dByBoneId = mat4MapTo2d(solvedWorld4ByBoneId);
  const solvedOriginByBoneId = originsFromWorld4(solvedWorld4ByBoneId);

  return {
    project,
    time,
    fkWorld4ByBoneId,
    fkWorld2dByBoneId,
    fkOriginByBoneId,
    ikSolvedLocalRotByBoneId,
    solvedWorld4ByBoneId,
    solvedWorld2dByBoneId,
    solvedOriginByBoneId,
  };
}
