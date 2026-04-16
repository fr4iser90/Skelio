# 15 — Product gaps and roadmap

This document states **known limitations** and a **prioritized plan**. It is not a marketing status page.

## Design principle (non-negotiable)

**Intuition beats explanation.** If the correct fix is “the user must read something first,” that is a **failed** interaction for Skelio’s target audience. The product should **default to behavior that works** in common rigs (grab end effector → limb follows; move body → keys behave predictably). Copy, banners, and tooltips are **last-resort polish**, not substitutes for correct engineering and direct manipulation.

---

## IK

**Current behavior**

- Two-bone IK and planar FABRIK live in `@skelio/domain` (`evaluatePose`, solvers under `packages/domain/src/editor/rig/`).
- Two-bone IK is **skipped** when chain bones have **tilt** or **spin** (unless strict 2D mode forces `planar2dNoTiltSpin`).
- FABRIK similarly bails when the chain is non-planar under the same rules.
- **Bake IK → FK** in the UI is built around **two-bone** chains; FABRIK baking is incomplete or absent.

**What feels broken**

- IK can **silently do nothing** while the rig still looks “valid,” which reads as a bug, not a learning moment.
- Camera / rig dimensionality and solver assumptions can **diverge** without the user changing a mental model—because they should not need one.

**Plan (engineering and interaction, not “explain more”)**

1. **Eliminate silent no-op:** choose a technical default so common setups always get a solve—e.g. automatically feed IK from a **consistent planar projection** of the chain for the solve step when tilt/spin are non-zero, **or** restrict bone DOFs in modes where the solver is planar-only, **or** upgrade solvers where justified. Pick one coherent strategy per mode; ship behavior, not lectures.
2. **Viewport-first authoring:** dragging IK targets / poles (and optional bone pins) is the primary loop; numeric inspector fields stay secondary.
3. **FABRIK parity:** if FABRIK is offered in the UI, **bake-to-FK** and timeline integration must match what two-bone already gets, or FABRIK is demoted until it does.

---

## FK and animation

**Current behavior**

- FK from clip sampling; IK overlays solved rotations.

**What feels broken**

- It is unclear **what to grab** so the character moves the way animators expect (hands/feet vs individual bones vs keys).

**Plan**

1. **Effector-first manipulation** as default: end-of-chain handles behave like film rigs; FK on intermediate joints stays predictable.
2. **One stack of truth in the tool:** the app chooses driver precedence in code (keys vs IK vs constraints) so scrubbing the timeline never “lies.” Avoid UI that asks the user to learn FK vs IK theory first.

---

## Mesh and skinning

**Current behavior**

- Character rig slices → skinned meshes (simplified geometry); weight painting exists on supported paths.

**What feels broken**

- The mesh loop is still **slow and rough** compared to what animators expect from mature 2D DCCs.

**Plan**

1. **Ship better tools** (weight painting flow, slice binding, deformation preview), measured against real tasks—not a static “limits” page as the main deliverable.
2. Keep the runtime **`skins`** contract stable; schema changes only via semver + ADR.

---

## 2D / 2.5D / 3D viewport

**Current behavior**

- Camera modes switch ortho vs perspective; strict 2D toggles `planar2dNoTiltSpin` into the pose pipeline.
- `rigCameraWorldYScale` is fixed at `1`; depth is mostly camera + slice depth.

**What feels broken**

- Modes can **read** like full spatial rigging while the IK core is still **planar-first**.

**Plan**

1. **Align mode with math:** either the solver path matches what “3D” implies, or the product **narrows what the mode promises** until it does—implemented in behavior and camera rig, not only in wording.
2. If optional squash/stretch returns, it must interact with IK in a defined, test-covered way—not as a hidden footgun.

---

## Documentation and process (maintainers)

**Baseline**

- `docs/00`–`docs/15` (English) for contributors and automation.
- **ADRs** under `docs/adr/` when export or persistence decisions are made.

**Plan**

- Keep **AGENTS.md** and **`.cursor/rules/`** in sync with `docs/`. This is **not** a substitute for intuitive in-app behavior.

---

## Runtime and Godot

**Plan**

- Keep the **Godot minimal example** truthful with the schema; grow it as the editor grows. Contract tests stay the guardrail.
