# 18 — Editor inverse kinematics (IK) only

English reference for **inverse kinematics** in `@skelio/domain`: chains, targets, poles, FABRIK, rotation overrides, and how they attach to the FK pipeline.

**Forward kinematics (FK) is documented separately** — do not mix the two manuals: **[17-editor-forward-kinematics.md](./17-editor-forward-kinematics.md)**.

---

## 1. Relation to FK

IK does **not** replace the whole skeleton. The editor:

1. Computes **FK** local state and world matrices (bind + clip) — doc 17.
2. Optionally computes **`rotOverrides`** for specific bones from enabled IK chains.
3. Rebuilds world matrices using the same FK locals **except** where `rot` is replaced by the IK result (**solved** pose).

Entry point for both steps: **`evaluatePose`** in `packages/domain/src/editor/rig/evaluatePose.ts`.

---

## 2. When IK runs

IK runs **only if**:

- `evaluatePose` is called with **`applyIk: true`** (this is **not** the API default — the default is FK-only; see below), **and**
- The project contains an IK chain with **`enabled: true`**.

If `applyIk` is omitted or `false`, no `rotOverrides` are applied; **solved** outputs equal FK.

**API default:** `evaluatePose(project, time)` without options uses **`applyIk: false`**. The desktop animator viewports also use **`applyIk: false`** — IK chains are **not** applied in the live canvas until a product decision wires **`applyIk: true`** (e.g. when the user enables IK for preview). Call `evaluatePose` with **`applyIk: true`** yourself to test IK in code.

---

## 3. Data: where chains live

**Two-bone chains** (three bones: root → mid → tip):

- `project.rig?.ik?.twoBoneChains`, or legacy `project.ikTwoBoneChains`  
- Type: `IkTwoBoneChain` — `id`, `name`, `enabled`, `rootBoneId`, `midBoneId`, `tipBoneId`, `targetX`, `targetY`, optional `poleX`/`poleY`, optional `allowStretch`.

**FABRIK chains** (strict parent line, any length ≥ 3 bones):

- `project.rig?.ik?.fabrikChains`  
- Type: `IkPlanarFabrikChain` — `id`, `name`, `enabled`, `boneIds[]`, `targetX`, `targetY`, optional `poleX`/`poleY` (declared on type; **current FABRIK solver path does not use poles** — only the target is passed to `fabrik2dChain`).

**Controls** (world overrides, optionally animated):

- `project.rig?.controls?.ikTargets2d` — links `chainId` to base `x`, `y`, optional `poleX`, `poleY`, `enabled`.

**Accessors:** `packages/domain/src/editor/rig/accessors.ts` — `getTwoBoneIkChains`, `getFabrikIkChains`.

---

## 4. Layering order (same evaluation pass)

Inside `evaluatePose`:

1. Start with empty `rotOverrides: Map<boneId, absoluteLocalRot>`.
2. For each **enabled** two-bone chain (array order): solve → set overrides for **root** and **mid** only.
3. For each **enabled** FABRIK chain (array order): solve → set overrides for **every** bone in `boneIds` (overwrites any previous entry for the same id).

**Rule:** If a bone id appears in both systems, **FABRIK wins** (applied later).

---

## 5. Two-bone IK

**Glue:** `packages/domain/src/editor/rig/solveTwoBoneChain2d.ts`  
**Math:** `packages/domain/src/editor/rig/ik2bone2d.ts` — `solveTwoBoneIk2d`

**Requirements:** Strict hierarchy: `mid.parentId === root.id`, `tip.parentId === mid.id`.

**Inputs (conceptual):**

- Root joint world position from **FK** matrix of root at `time`.
- FK mid joint for **default bend** when no pole.
- **Target** world `(x,y)` from `sampleIkTargetOverride2d` (controls + tracks) or chain `targetX`/`targetY`.
- **Segment lengths** from **bind-pose joint distances** (`worldBindOrigins` + `segmentLengthsFromBindOrigins`), not raw `bone.length` alone.
- **Pole:** control pole (if both `poleX`/`poleY` sampled) **else** chain `poleX`/`poleY`. Used to pick elbow/knee **side** (see §8).
- **`allowStretch`:** if target unreachable, optionally scale segment lengths proportionally.

**Skip:** If `planar2dNoTiltSpin` is false and any of root/mid/tip has non-zero **tilt** or **spin** at `time`, that chain is skipped for that frame.

**Output:** Absolute local Z rotations for **root** and **mid** only; converted via `twoBoneIkAbsoluteLocalRotsAtTime`. The **tip** bone is not given a two-bone IK rotation override.

---

## 6. Planar FABRIK

**Module:** `packages/domain/src/editor/rig/solveFabrikPlanarChain2d.ts`  
**Core iteration:** `packages/domain/src/editor/ik2d.ts` — `fabrik2dChain`

**Requirements:** `boneIds` must be a strict parent line (`validateFabrikBoneChain`).

**Lengths:** From bind world joint polyline.  
**Init:** FK world joint positions at `time`.  
**Target:** From control override or chain `targetX`/`targetY`.

**Skip:** If any bone in the chain has non-zero tilt/spin when not in planar mode, or validation fails.

**Output:** Absolute local rotation for **each** bone in `boneIds`.

---

## 7. Rig controls and animated targets

**Module:** `packages/domain/src/editor/rig/controls.ts`

**`sampleIkTargetOverride2d(project, chainId, time)`**

- Finds enabled `ikTargets2d` entry with matching `chainId`.
- Samples `x`, `y` from `clip.controlTracks` if present; else control base values.
- Samples `poleX`/`poleY` only if both exist on the control base; then both are track-sampled.

**Precedence for solvers:** Control override **else** chain-stored `targetX`/`targetY` (and pole fields for two-bone as described in solveTwoBoneChain2d).

---

## 8. Poles (two-bone IK only)

**Role:** Choose which of the two valid mid-joint solutions (two sides of the root→target line) matches the intended bend (knee/elbow direction).

**Implementation sketch:** `solveTwoBoneIk2d` builds two candidates; if **`pole`** is set, pick side using the sign of the 2D cross product of the aim direction and `pole - root`; if **no pole**, pick the candidate closer to the **FK mid** position.

**FABRIK:** Pole fields on `IkPlanarFabrikChain` are not wired into the current `fabrikIkAbsoluteLocalRotsAtTime` implementation (target-only).

---

## 9. `PoseState`: IK-related fields

| Field | Meaning |
|-------|---------|
| `solvedWorld4ByBoneId` | World 4×4 after `rotOverrides` replace FK `rot` where present. |
| `solvedWorld2dByBoneId` | XY projection of solved matrices. |
| `solvedOriginByBoneId` | Joint positions used by the 2D viewport when IK is active. |
| `ikSolvedLocalRotByBoneId` | Bookkeeping: IK-produced absolute local rotations per bone id. |

---

## 10. Desktop 2D viewport

**Files:** `ViewportPanel.vue`, `AnimatorThreeViewport.vue`, `CharacterRigThreeViewport.vue` — pose evaluation uses:

```ts
evaluatePose(project, t, { applyIk: false, planar2dNoTiltSpin: planar })
```

So the **live canvas is FK-only**; IK chain data in the project does not change the displayed pose until the app passes **`applyIk: true`**. IK handle drag code may still patch control previews for future use.

---

## 11. Constraints

`evaluatePose` comments mention future **constraints/limits** on `PoseState`. There is **no** separate constraint solver after IK in the current code.

---

## 12. Baking IK to FK keys

**Module:** `packages/domain/src/editor/rig/bakeIkToFk.ts` — produces clip **`rot`** channel values (offset-from-bind) for two-bone chains at a time sample. FABRIK baking may be partial in UI; verify `packages/application` when extending.

---

## 13. Runtime export

Editor IK configuration and solved poses are **not** the same as the runtime skeleton JSON contract. See [04-data-model-schema.md](./04-data-model-schema.md) and ADRs.

---

## 14. Code map (IK only)

| Topic | File |
|-------|------|
| Orchestration | `rig/evaluatePose.ts` |
| Two-bone solve | `rig/solveTwoBoneChain2d.ts`, `rig/ik2bone2d.ts` |
| FABRIK solve | `rig/solveFabrikPlanarChain2d.ts`, `ik2d.ts` |
| Control sampling | `rig/controls.ts` |
| Chain accessors | `rig/accessors.ts` |
| Types | `rig/types.ts` (`IkTwoBoneChain`, `IkPlanarFabrikChain`, `EditorRig`) |

---

## 15. Back to FK

Bind, clips, world FK chain, `fkWorld*`: **[17-editor-forward-kinematics.md](./17-editor-forward-kinematics.md)**.
