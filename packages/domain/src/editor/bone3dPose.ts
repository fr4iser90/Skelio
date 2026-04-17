import {
  mat4Multiply,
  transformPointMat4,
  type Mat4,
} from "./mat4.js";
import type { AnimationClip, Bone, EditorProject, Transform2D } from "./types.js";

export type LocalBoneState = {
  x: number;
  y: number;
  z: number;
  rot: number;
  tilt: number;
  spin: number;
  sx: number;
  sy: number;
};

/** Optional sampling tweaks (editor viewport modes). */
export type GetLocalBoneStateOpts = {
  /** Treat `tilt`/`spin` as 0 for this sample (2D camera / planar authoring). */
  planar2dNoTiltSpin?: boolean;
  /**
   * When set with {@link planar2dNoTiltSpin}, do **not** force a sole child’s local attach to `(parent.length,0)`.
   * That snap closes FK gaps after 3D tilt; for bind authoring the stored `bindPose.x/y` must drive the joint.
   */
  skipPlanarChildTipSnap?: boolean;
};

function sampleChannel(keys: { t: number; v: number }[], t: number, fallback: number): number {
  if (keys.length === 0) return fallback;
  if (t <= keys[0]!.t) return keys[0]!.v;
  if (t >= keys[keys.length - 1]!.t) return keys[keys.length - 1]!.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i]!;
    const k1 = keys[i + 1]!;
    if (t >= k0.t && t <= k1.t) {
      const u = (t - k0.t) / (k1.t - k0.t || 1e-9);
      return k0.v + u * (k1.v - k0.v);
    }
  }
  return fallback;
}

/** Pose + clips: full local state including Z / tilt / spin. */
export function getLocalBoneState(
  bone: Bone,
  clip: AnimationClip | undefined,
  time: number,
  opts?: GetLocalBoneStateOpts,
): LocalBoneState {
  const tr = clip?.tracks.find((x) => x.boneId === bone.id);
  const bp = bone.bindPose;
  const b3 = bone.bindBone3d;
  const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
  let x = bp.x;
  let y = bp.y;
  let z = zBase;
  let rot = bp.rotation;
  let tilt = b3?.tilt ?? 0;
  let spin = b3?.spin ?? 0;
  if (tr) {
    for (const ch of tr.channels) {
      // Channel values are offsets from bind (EditorMeta.clipTransformsRelativeToBind).
      if (ch.property === "tx") x = bp.x + sampleChannel(ch.keys, time, 0);
      if (ch.property === "ty") y = bp.y + sampleChannel(ch.keys, time, 0);
      if (ch.property === "tz") z = zBase + sampleChannel(ch.keys, time, 0);
      if (ch.property === "rot") rot = bp.rotation + sampleChannel(ch.keys, time, 0);
      if (ch.property === "tilt") tilt = (b3?.tilt ?? 0) + sampleChannel(ch.keys, time, 0);
      if (ch.property === "spin") spin = (b3?.spin ?? 0) + sampleChannel(ch.keys, time, 0);
    }
  }
  const s = { x, y, z, rot, tilt, spin, sx: bp.sx, sy: bp.sy };
  if (opts?.planar2dNoTiltSpin) {
    return { ...s, tilt: 0, spin: 0 };
  }
  return s;
}

/** Bind-only local state (no animation). Optional 2D bind override for one bone (tip-drag preview). */
export function getBindLocalBoneState(
  bone: Bone,
  overrideBoneId: string | null,
  bindPoseOverride: Transform2D | null,
  opts?: GetLocalBoneStateOpts,
): LocalBoneState {
  const bp = bone.bindPose;
  const b3 = bone.bindBone3d;
  const zBase = (b3?.z ?? 0) + (b3?.depthOffset ?? 0);
  let s: LocalBoneState;
  if (overrideBoneId && bone.id === overrideBoneId && bindPoseOverride) {
    s = {
      x: bindPoseOverride.x,
      y: bindPoseOverride.y,
      z: zBase,
      rot: bindPoseOverride.rotation,
      tilt: b3?.tilt ?? 0,
      spin: b3?.spin ?? 0,
      sx: bindPoseOverride.sx,
      sy: bindPoseOverride.sy,
    };
  } else {
    s = {
      x: bp.x,
      y: bp.y,
      z: zBase,
      rot: bp.rotation,
      tilt: b3?.tilt ?? 0,
      spin: b3?.spin ?? 0,
      sx: bp.sx,
      sy: bp.sy,
    };
  }
  if (opts?.planar2dNoTiltSpin) {
    return { ...s, tilt: 0, spin: 0 };
  }
  return s;
}

/** T * Rz * Rx * Ry * S — siehe ADR 0011. */
export function localMat4FromState(s: LocalBoneState): Mat4 {
  // Build `T * Rz * Rx * Ry * S` directly to avoid intermediate Mat4 allocations.
  // Layout is column-major (OpenGL-style), matching `Mat4` and all mat4 ops in this repo.
  const cz = Math.cos(s.rot);
  const sz = Math.sin(s.rot);
  const cx = Math.cos(s.tilt);
  const sx = Math.sin(s.tilt);
  const cy = Math.cos(s.spin);
  const sy = Math.sin(s.spin);

  // R = Rz * Rx * Ry.
  // Then apply non-uniform scale on local X/Y axes: col0 *= sx, col1 *= sy, col2 unchanged (scale z=1).
  const m = new Float64Array(16);

  // Column 0 = R * (1,0,0) scaled by s.sx
  m[0] = (cz * cy + sz * sx * sy) * s.sx;
  m[1] = (sz * cy - cz * sx * sy) * s.sx;
  m[2] = (cx * sy) * s.sx;
  m[3] = 0;

  // Column 1 = R * (0,1,0) scaled by s.sy
  m[4] = (sz * cx) * s.sy;
  m[5] = (cz * cx) * s.sy;
  m[6] = (-sx) * s.sy;
  m[7] = 0;

  // Column 2 = R * (0,0,1)
  m[8] = (-cz * sy + sz * sx * cy);
  m[9] = (-sz * sy - cz * sx * cy);
  m[10] = (cx * cy);
  m[11] = 0;

  // Column 3 = translation
  m[12] = s.x;
  m[13] = s.y;
  m[14] = s.z;
  m[15] = 1;

  return m;
}

/** Below this, the parent is treated as a point (e.g. root `length: 0`); keep stored `bindPose.x/y`. */
const PLANAR_TIP_SNAP_MIN_PARENT_LENGTH = 1e-5;

function countBonesWithParent(project: EditorProject, parentId: string): number {
  let n = 0;
  for (const b of project.bones) {
    if (b.parentId === parentId) n++;
  }
  return n;
}

/**
 * In planar 2D evaluation, stored `bindPose.x/y` may come from tilted 3D binds; the XY joint
 * then no longer lies on the parent’s local +X at `parent.length`, so FK segments show gaps.
 * Force the canonical child attach `(parent.length, 0)` so pose/bind chains and IK stay closed.
 *
 * Skipped when:
 * - `parent.length` is ~0 (typical root / point bones), or
 * - the parent has **more than one** child: every branch would otherwise get the same `(L,0)` and
 *   all limbs collapse to one point (e.g. everything stuck at the neck).
 */
function snapPlanarChildTranslationToParentTip(
  project: EditorProject,
  bone: Bone,
  s: LocalBoneState,
  opts?: GetLocalBoneStateOpts,
): LocalBoneState {
  if (!opts?.planar2dNoTiltSpin || bone.parentId === null) return s;
  if (opts.skipPlanarChildTipSnap) return s;
  const parent = project.bones.find((x) => x.id === bone.parentId);
  if (!parent || parent.length <= PLANAR_TIP_SNAP_MIN_PARENT_LENGTH) return s;
  // If the parent branches, snapping every child to `(L,0)` would collapse the rig.
  // But hands/feet commonly drift along the forearm/lower-leg axis in planar evaluation.
  // If a child is already authored near the parent tip (or explicitly follows it),
  // keep it closed even when helper/branch bones exist.
  const siblings = countBonesWithParent(project, bone.parentId);
  if (siblings !== 1) {
    const tipX = parent.length;
    // Tolerance must cover common authoring offsets (e.g. ankle/wrist joint not exactly at the bone tip),
    // while still avoiding collapsing unrelated branches.
    const eps = Math.max(0.75, 12, parent.length * 0.15); // world units ≈ px
    const nearTip = Math.abs((s.x ?? 0) - tipX) <= eps && Math.abs(s.y ?? 0) <= eps;
    if (!bone.followParentTip && !nearTip) return s;
  }
  return { ...s, x: parent.length, y: 0 };
}

function worldMat4sFromLocals(
  project: EditorProject,
  getLocal: (b: Bone) => LocalBoneState,
): Map<string, Mat4> {
  const byId = new Map(project.bones.map((b) => [b.id, b] as const));
  const childrenByParentId = new Map<string, Bone[]>();
  const roots: Bone[] = [];
  for (const b of project.bones) {
    if (b.parentId === null) {
      roots.push(b);
      continue;
    }
    const arr = childrenByParentId.get(b.parentId);
    if (arr) arr.push(b);
    else childrenByParentId.set(b.parentId, [b]);
  }
  const world = new Map<string, Mat4>();

  const visit = (id: string, parentWorld: Mat4 | null) => {
    const b = byId.get(id);
    if (!b) return;
    const local = localMat4FromState(getLocal(b));
    const w = parentWorld === null ? local : mat4Multiply(parentWorld, local);
    world.set(id, w);
    const kids = childrenByParentId.get(id);
    if (!kids) return;
    for (const c of kids) visit(c.id, w);
  };

  for (const r of roots) visit(r.id, null);
  return world;
}

/**
 * Internal perf helper: compute FK and solved world matrices in a single traversal.
 * Not exported from the package root; used by `evaluatePose` to fuse loops.
 */
export function worldPoseBoneMatrices4FusedFkAndSolved(
  project: EditorProject,
  time: number,
  rotOverrides: ReadonlyMap<string, number>,
  opts?: GetLocalBoneStateOpts,
): { fkWorld4ByBoneId: Map<string, Mat4>; solvedWorld4ByBoneId: Map<string, Mat4> } {
  const clip = project.clips.find((c) => c.id === project.activeClipId);

  const childrenByParentId = new Map<string, Bone[]>();
  const roots: Bone[] = [];
  for (const b of project.bones) {
    if (b.parentId === null) {
      roots.push(b);
      continue;
    }
    const arr = childrenByParentId.get(b.parentId);
    if (arr) arr.push(b);
    else childrenByParentId.set(b.parentId, [b]);
  }

  const fkWorld4ByBoneId = new Map<string, Mat4>();
  const solvedWorld4ByBoneId = new Map<string, Mat4>();

  // Iterative traversal avoids deep recursion on long chains.
  const stack: { bone: Bone; parentFk: Mat4 | null; parentSolved: Mat4 | null }[] = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push({ bone: roots[i]!, parentFk: null, parentSolved: null });
  }

  while (stack.length) {
    const cur = stack.pop()!;
    const b = cur.bone;

    const sFk = snapPlanarChildTranslationToParentTip(
      project,
      b,
      getLocalBoneState(b, clip, time, opts),
      opts,
    );
    const localFk = localMat4FromState(sFk);
    const worldFk = cur.parentFk === null ? localFk : mat4Multiply(cur.parentFk, localFk);
    fkWorld4ByBoneId.set(b.id, worldFk);

    const o = rotOverrides.get(b.id);
    const localSolved = o === undefined ? localFk : localMat4FromState({ ...sFk, rot: o });
    const worldSolved =
      cur.parentSolved === null ? localSolved : mat4Multiply(cur.parentSolved, localSolved);
    solvedWorld4ByBoneId.set(b.id, worldSolved);

    const kids = childrenByParentId.get(b.id);
    if (kids) {
      for (let i = kids.length - 1; i >= 0; i--) {
        stack.push({ bone: kids[i]!, parentFk: worldFk, parentSolved: worldSolved });
      }
    }
  }

  return { fkWorld4ByBoneId, solvedWorld4ByBoneId };
}

export function worldBindBoneMatrices4(project: EditorProject, opts?: GetLocalBoneStateOpts): Map<string, Mat4> {
  return worldMat4sFromLocals(project, (b) =>
    snapPlanarChildTranslationToParentTip(project, b, getBindLocalBoneState(b, null, null, opts), opts),
  );
}

export function worldBindBoneMatrices4OverridingBindPose(
  project: EditorProject,
  boneId: string,
  bindPoseOverride: Transform2D,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat4> {
  return worldMat4sFromLocals(project, (b) =>
    snapPlanarChildTranslationToParentTip(
      project,
      b,
      getBindLocalBoneState(b, boneId, bindPoseOverride, opts),
      opts,
    ),
  );
}

export function worldPoseBoneMatrices4(
  project: EditorProject,
  time: number,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat4> {
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  return worldMat4sFromLocals(project, (b) =>
    snapPlanarChildTranslationToParentTip(project, b, getLocalBoneState(b, clip, time, opts), opts),
  );
}

/**
 * Same as {@link worldPoseBoneMatrices4}, but overrides local Z rotation (radians) for specific bones.
 * Used by IK / constraints to inject solved rotations without duplicating the 4×4 chain.
 */
export function worldPoseBoneMatrices4WithRotOverrides(
  project: EditorProject,
  time: number,
  rotOverrides: ReadonlyMap<string, number>,
  opts?: GetLocalBoneStateOpts,
): Map<string, Mat4> {
  const clip = project.clips.find((c) => c.id === project.activeClipId);
  return worldMat4sFromLocals(project, (b) => {
    const s = snapPlanarChildTranslationToParentTip(project, b, getLocalBoneState(b, clip, time, opts), opts);
    const o = rotOverrides.get(b.id);
    if (o !== undefined) return { ...s, rot: o };
    return s;
  });
}

export function worldOriginFromMat4(m: Mat4): { x: number; y: number } {
  return { x: m[12], y: m[13] };
}

export function worldTipFromMat4(m: Mat4, length: number): { x: number; y: number } {
  const p = transformPointMat4(m, length, 0, 0);
  return { x: p.x, y: p.y };
}
