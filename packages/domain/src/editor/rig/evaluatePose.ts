import type { Vec2 } from "../ik2d.js";
import type { Mat2D } from "../mat2d.js";
import type { Mat4 } from "../mat4.js";
import {
  getLocalBoneState,
  mat4ToMat2dProjection,
  worldOriginFromMat4,
  worldPoseBoneMatrices4FusedFkAndSolved,
} from "../bone3dPose.js";
import type { EditorProject } from "../types.js";
import { getFabrikIkChains, getTwoBoneIkChains } from "./accessors.js";
import { fabrikIkAbsoluteLocalRotsAtTime } from "./solveFabrikPlanarChain2d.js";
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
 * - IK: 2-bone chains inject solved rotations on root/mid; planar FABRIK chains on longer lines
 *   override every bone in the chain (applied after two-bone so leg FABRIK wins when both exist).
 * - Constraints/Limits: future (operate on {@link PoseState})
 */
function chainBoneHasTiltOrSpin(
  project: EditorProject,
  time: number,
  boneId: string,
  planar2dNoTiltSpin: boolean,
): boolean {
  if (planar2dNoTiltSpin) return false;
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  const b = project.bones.find((x) => x.id === boneId);
  if (!b) return false;
  const s = getLocalBoneState(b, clip, time);
  return Math.abs(s.tilt) > 1e-5 || Math.abs(s.spin) > 1e-5;
}

export function evaluatePose(project: EditorProject, time: number, opts?: EvaluatePoseOptions): PoseState {
  const applyIk = opts?.applyIk ?? true;
  const planar2dNoTiltSpin = opts?.planar2dNoTiltSpin ?? false;
  /** Match 2D bind authoring (`bindPose.x/y`): never snap sole children to `(parent.length,0)` in planar mode. */
  const planarOpts = planar2dNoTiltSpin
    ? ({ planar2dNoTiltSpin: true, skipPlanarChildTipSnap: true } as const)
    : undefined;
  const ikSolvedLocalRotByBoneId = new Map<string, number>();
  const rotOverrides = new Map<string, number>();

  if (applyIk) {
    for (const chain of getTwoBoneIkChains(project)) {
      if (!chain.enabled) continue;
      if (
        chainBoneHasTiltOrSpin(project, time, chain.rootBoneId, planar2dNoTiltSpin) ||
        chainBoneHasTiltOrSpin(project, time, chain.midBoneId, planar2dNoTiltSpin) ||
        chainBoneHasTiltOrSpin(project, time, chain.tipBoneId, planar2dNoTiltSpin)
      ) {
        continue;
      }
      const rots = twoBoneIkAbsoluteLocalRotsAtTime(project, time, chain.id, planar2dNoTiltSpin);
      if (!rots) continue;
      rotOverrides.set(rots.rootBoneId, rots.rootLocalRot);
      rotOverrides.set(rots.midBoneId, rots.midLocalRot);
      ikSolvedLocalRotByBoneId.set(rots.rootBoneId, rots.rootLocalRot);
      ikSolvedLocalRotByBoneId.set(rots.midBoneId, rots.midLocalRot);
    }

    for (const chain of getFabrikIkChains(project)) {
      if (!chain.enabled) continue;
      const rots = fabrikIkAbsoluteLocalRotsAtTime(project, time, chain.id, planar2dNoTiltSpin);
      if (!rots) continue;
      for (const [boneId, r] of rots) {
        rotOverrides.set(boneId, r);
        ikSolvedLocalRotByBoneId.set(boneId, r);
      }
    }
  }

  const { fkWorld4ByBoneId, solvedWorld4ByBoneId } = worldPoseBoneMatrices4FusedFkAndSolved(
    project,
    time,
    rotOverrides,
    planarOpts,
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
