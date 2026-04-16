# 09 — Domain editor pipeline

## Pose evaluation

`evaluatePose` in `@skelio/domain` is the main **deterministic** entry: given `EditorProject` and time, it returns FK matrices, IK-injected rotations, and solved world poses.

Pipeline (simplified):

1. Sample **FK** from the active clip.
2. Apply **two-bone IK** chains where enabled (see skip rules below).
3. Apply **planar FABRIK** chains (longer chains), layered after two-bone so overlapping chains behave predictably.
4. Fuse into **solved** world matrices.

## Planar IK and tilt/spin

Two-bone and FABRIK planar solvers assume a **planar** configuration unless `planar2dNoTiltSpin` is set (used when the viewport is strict 2D planar mode). If bones have non-zero **tilt** or **spin**, two-bone IK for that chain is **skipped** (solver returns no override for that step); FABRIK similarly guards non-planar chains.

Code reference: `packages/domain/src/editor/rig/evaluatePose.ts`, `solveFabrikPlanarChain2d.ts`.

## Character rig meshes

Character rig slices can generate **skinned meshes** (flat quads with optional depth extrusion). Binding completeness is validated before treating the rig as mesh-ready.

Code reference: `packages/domain/src/editor/characterRigMesh.ts`.

## Baking IK to FK

`bakeIkToFk` / `bakeIkTwoBoneChainRotKeysAtTime` targets **two-bone** chains. FABRIK baking may be incomplete or absent in UI — verify `packages/application` and timeline UI when extending.
