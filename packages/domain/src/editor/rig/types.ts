import type { Mat2D } from "../mat2d.js";
import type { Mat4 } from "../mat4.js";
import type { Vec2 } from "../ik2d.js";
import type { Bone, EditorProject } from "../types.js";

/**
 * Transient, per-evaluation rig state. This is editor-only and intentionally not exported to runtime JSON.
 *
 * FK fields come from clip sampling; solved fields apply IK (and later constraints) on top.
 */
export type PoseState = {
  /** Input project snapshot (for convenience / debugging). */
  project: EditorProject;
  /** Evaluation time (seconds). */
  time: number;

  /** FK world 4×4 bone matrices (ADR-0011 chain). */
  fkWorld4ByBoneId: Map<string, Mat4>;

  /** FK world matrices (2D projection from ADR-0011 4×4 chain). */
  fkWorld2dByBoneId: Map<string, Mat2D>;

  /** FK joint origins (world). */
  fkOriginByBoneId: Map<string, Vec2>;

  /**
   * Absolute local Z rotation (radians) injected by IK for chain root/mid bones.
   * Empty when `applyIk` is false or no chains; later entries override earlier when chains overlap.
   */
  ikSolvedLocalRotByBoneId: Map<string, number>;

  /** World 4×4 bone matrices after IK rotation overrides (same as FK when no IK). */
  solvedWorld4ByBoneId: Map<string, Mat4>;

  /** World 2D projection after IK (for canvas / legacy 2D consumers). */
  solvedWorld2dByBoneId: Map<string, Mat2D>;

  /** Joint origins from solved matrices (world). */
  solvedOriginByBoneId: Map<string, Vec2>;
};

export type EvaluatePoseOptions = {
  /**
   * When true, enabled IK chains override local rotations. When false or omitted, result is **FK only**
   * (`solved*` matches `fk*`).
   */
  applyIk?: boolean;
  /**
   * When true (e.g. rig camera „2D“): `tilt` / `spin` are treated as zero for FK/IK and 4×4 pose —
   * pure planar rotation in the viewport; bind/clip data stay unchanged.
   */
  planar2dNoTiltSpin?: boolean;
  /**
   * When set together with {@link planar2dNoTiltSpin}, do not auto-snap child local bind translations
   * to the parent tip. This makes planar 2D evaluation respect authored `bindPose.x/y`.
   */
  skipPlanarChildTipSnap?: boolean;
};

export type BakeIkToFkOptions = {
  /**
   * Bake at discrete sample times.
   * Usually use clip key times or uniform sampling at fps.
   */
  sampleTimes: number[];
  /** IK chain id (from project.ikTwoBoneChains) to bake. */
  chainId: string;
};

export type BakeIkToFkResult = {
  /** Bone ids that received keys. */
  bakedBoneIds: string[];
  /** Number of keys added/overwritten. */
  keyCount: number;
};

export type TwoBoneChainResolved = {
  id: string;
  root: Bone;
  mid: Bone;
  tip: Bone;
};

