# 15 — Product gaps and roadmap

This document states **known limitations** and a **prioritized plan**. It is not a marketing status page.

## IK

**Current behavior**

- Two-bone IK and planar FABRIK are implemented in `@skelio/domain` (`evaluatePose`, solvers under `packages/domain/src/editor/rig/`).
- Two-bone IK is **skipped** when chain bones have **tilt** or **spin** (unless planar-2D mode forces `planar2dNoTiltSpin`).
- FABRIK similarly refuses non-planar chains when tilt/spin is present.
- **Bake IK → FK** in the UI is oriented around **two-bone** chains; FABRIK baking may be missing or incomplete.

**Problems for users**

- IK can appear to “do nothing” with no in-viewport explanation (tilt/spin skip).
- Mixed 2.5D/3D expectations vs planar solvers are easy to misunderstand.

**Plan**

1. Surface **why IK did not apply** (inspector banner or dev overlay keyed off skip reasons).
2. Decide product stance: educate (tooltips) vs extend solvers (harder) vs automatic “planar projection” mode.
3. Extend or add **FABRIK bake** if FABRIK is a first-class authoring tool.

## FK and animation UX

**Current behavior**

- FK comes from clip sampling; IK overlays solved rotations.

**Problems**

- Users may not see a clear **mental model** (what is driven by keys vs IK targets).
- Pole/target UX exists for some flows but may feel technical.

**Plan**

1. **Effector-first** language in UI (hands/feet targets) where possible.
2. Explicit mode badges: “Keys drive / IK drives / mixed” per bone or chain.
3. Optional visualization of **influence** or override stack.

## Mesh and skinning

**Current behavior**

- Character rig slices can become **skinned meshes** (simplified geometry, bindings).
- Weight painting exists in the desktop app for supported paths.

**Problems**

- Authoring parity with mature 2D mesh tools is **not** the current reality.
- Users expecting Spine-level mesh workflows will hit gaps quickly.

**Plan**

1. Document **exactly** which mesh paths are supported in-editor vs import-only.
2. Improve weight painting ergonomics iteratively with tests.
3. Keep runtime **`skins`** contract stable; evolve via schema semver + ADR.

## 2D / 2.5D / 3D viewport

**Current behavior**

- Camera modes switch orthographic vs perspective; domain gets `planar2dNoTiltSpin` when mode is strict 2D.
- `rigCameraWorldYScale` is currently fixed (no extra world-Y squash in store); depth feel comes from camera/perspective and slice depth where implemented.

**Problems**

- Naming can imply full 3D rigging while the solver stack remains **2D-planar-first**.

**Plan**

1. Rename or explain modes in UI copy (“Camera” vs “Rig dimensionality”).
2. If world-Y scale returns, document interaction with IK planarity.

## Documentation and process

**Fixed baseline**

- `docs/00`–`docs/15` (English) are the canonical narrative.
- **ADRs** still need real files under `docs/adr/` when decisions are recorded.

**Plan**

1. Add ADRs as decisions land (export, time base, coordinates).
2. Keep **AGENTS.md** and **`.cursor/rules/`** links synchronized with `docs/`.

## Runtime and Godot

**Problems**

- End-to-end **Godot sample** may lag the editor.

**Plan**

1. Minimal Godot loader example + issue-linked milestones.
2. Contract tests remain the guardrail until samples exist.
