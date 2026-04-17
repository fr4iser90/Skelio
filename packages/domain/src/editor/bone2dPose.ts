import type { Mat2D } from "./mat2d.js";
import type { Mat4 } from "./mat4.js";
import type { EditorProject, Transform2D } from "./types.js";
import {
  type GetLocalBoneStateOpts,
  worldBindBoneMatrices4,
  worldBindBoneMatrices4OverridingBindPose,
  worldPoseBoneMatrices4,
  worldPoseBoneMatrices4WithRotOverrides,
} from "./bone3dPose.js";

/**
 * Planar 2D-FK (closed chain): treat `tilt/spin` as 0 for sampling/eval.
 * Tip-snap behavior is controlled by the 4×4 chain when `planar2dNoTiltSpin` is set.
 */
export const planar2dClosedFkChainOpts: GetLocalBoneStateOpts = {
  planar2dNoTiltSpin: true,
};

/** XY projection of the upper 2×2 + translation (used by 2D tooling / skinning). */
export function mat4ToMat2dProjection(m: Mat4): Mat2D {
  return { a: m[0], b: m[1], c: m[4], d: m[5], e: m[12], f: m[13] };
}

export function worldPoseBoneMatrices2DWithRotOverrides(
  project: EditorProject,
  time: number,
  rotOverrides: ReadonlyMap<string, number>,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat2D> {
  const m4 = worldPoseBoneMatrices4WithRotOverrides(project, time, rotOverrides, opts);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) out.set(id, mat4ToMat2dProjection(m));
  return out;
}

export function worldPoseBoneMatrices2D(
  project: EditorProject,
  time: number,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat2D> {
  const m4 = worldPoseBoneMatrices4(project, time, opts);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) out.set(id, mat4ToMat2dProjection(m));
  return out;
}

export function worldBindBoneMatrices2D(project: EditorProject, opts?: GetLocalBoneStateOpts): Map<string, Mat2D> {
  const m4 = worldBindBoneMatrices4(project, opts);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) out.set(id, mat4ToMat2dProjection(m));
  return out;
}

export function worldBindBoneMatrices2DOverridingBindPose(
  project: EditorProject,
  boneId: string,
  bindPoseOverride: Transform2D,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat2D> {
  const m4 = worldBindBoneMatrices4OverridingBindPose(project, boneId, bindPoseOverride, opts);
  const out = new Map<string, Mat2D>();
  for (const [id, m] of m4) out.set(id, mat4ToMat2dProjection(m));
  return out;
}

