# 17 — Editor forward kinematics (FK) only

English reference for **forward kinematics** in `@skelio/domain`: how bind pose + animation clips become local bone state and world bone matrices.

**Inverse kinematics (IK) is documented separately** — do not mix the two manuals: **[18-editor-inverse-kinematics.md](./18-editor-inverse-kinematics.md)**.

For the small pipeline overview, see [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md).

---

## 1. What “FK” means here

**Forward kinematics:** For each bone, local transform is computed from **rest pose (bind)** plus **active clip channels** at time `t`. World matrices are built by multiplying down the parent chain. No IK targets or pole logic — that is all in doc 18.

The editor still uses a single function **`evaluatePose`** to compute both FK-only fields and IK-augmented fields in one pass; **this document only describes the FK half** (`fkWorld*`, `fkOrigin*`, and the sampling/math that feeds them).

---

## 2. Clip sampling: `getLocalBoneState`

**Module:** `packages/domain/src/editor/bone3dPose.ts`  
**Inputs:** `bone`, active `AnimationClip` (from `project.activeClipId`), `time`, optional `GetLocalBoneStateOpts`.

**Bind sources:**

- `bone.bindPose` — `x`, `y`, `rotation`, `sx`, `sy`
- `bone.bindBone3d` — `z`, `depthOffset`, `tilt`, `spin`, etc.

**Channels** (per-bone tracks on the clip): when a channel exists, values are combined with bind. With `EditorMeta.clipTransformsRelativeToBind === true` (default for new projects), numeric channels are **offsets from bind**:

| Property | Role |
|----------|------|
| `tx`, `ty` | Added to bind `x` / `y`. |
| `tz` | Added to base Z (`bindBone3d.z + depthOffset`). |
| `rot` | `bindPose.rotation +` channel value (radians). |
| `tilt`, `spin` | Added to bindBone3d tilt/spin. |

Between keys, values are **linearly interpolated** (`sampleChannel`).

**Planar 2D option:** `planar2dNoTiltSpin: true` forces `tilt = 0` and `spin = 0` in the returned `LocalBoneState` for that sample.

---

## 3. Local matrix: `localMat4FromState`

**Module:** `packages/domain/src/editor/bone3dPose.js`

Builds **`T * Rz * Rx * Ry * S`** (column-major 4×4) from `LocalBoneState`. Non-uniform `sx`/`sy` scale local axes. This is the same transform chain described in ADR 0011 (editor bone 3D bind pose).

---

## 4. Optional: planar child attach snap

**Function:** `snapPlanarChildTranslationToParentTip` in `bone3dPose.ts`

When **all** of the following hold:

- `planar2dNoTiltSpin` is true,
- `skipPlanarChildTipSnap` is **not** set,
- bone has a parent,
- parent `length` is above a tiny epsilon,
- the parent has **exactly one** child,

then the child’s local translation is forced to **`(parent.length, 0)`** so the child joint sits on the parent’s tip in parent space (useful when closing gaps for some import/bind workflows).

**Important:** `evaluatePose` uses **`skipPlanarChildTipSnap: true`** whenever it enables planar mode, so this snap does **not** run inside the main editor pose evaluation path — stored `bindPose.x/y` remain authoritative there.

---

## 5. World FK chain

**Functions:** `worldPoseBoneMatrices4`, `worldMat4sFromLocals`, and the FK branch inside `worldPoseBoneMatrices4FusedFkAndSolved`.

Traversal: roots first, then children. For each bone:

1. `sFk = snapPlanarChildTranslationToParentTip(project, bone, getLocalBoneState(bone, clip, time, opts), opts)`
2. `localFk = localMat4FromState(sFk)`
3. `worldFk = parentWorld * localFk` (root: no parent)

Result: **`fkWorld4ByBoneId`** in the fused evaluator, or the sole output of `worldPoseBoneMatrices4` when used alone.

**2D projection:** Upper 2×2 + translation (`mat4ToMat2dProjection`) → `fkWorld2dByBoneId`.

**Origins:** Translation column of each world 4×4 → joint position → **`fkOriginByBoneId`**.

---

## 6. `PoseState`: FK fields only (from `evaluatePose`)

When you call `evaluatePose`, these fields are **pure FK** (no IK rotation overrides):

| Field | Meaning |
|-------|---------|
| `fkWorld4ByBoneId` | World 4×4 per bone from clip FK only. |
| `fkWorld2dByBoneId` | XY projection of the above. |
| `fkOriginByBoneId` | World joint positions from FK. |

Anything named **`solved*`** or **`ikSolved*`** involves IK — see doc 18.

---

## 7. FK without IK (default API behavior)

**`evaluatePose(project, time)`** with no third argument uses **`applyIk: false`** by default — **`solved*` equals `fk*`** (pure FK).

For explicit planar sampling:

```ts
evaluatePose(project, time, { applyIk: false, planar2dNoTiltSpin: true })
```

The desktop animator viewports use **`applyIk: false`** (pure FK in the canvas). See doc 18 for IK evaluation.

---

## 8. Code map (FK only)

| Topic | File |
|-------|------|
| Local state sampling | `packages/domain/src/editor/bone3dPose.ts` — `getLocalBoneState`, `getBindLocalBoneState` |
| Local → Mat4 | `bone3dPose.ts` — `localMat4FromState` |
| World FK chain | `bone3dPose.ts` — `worldPoseBoneMatrices4`, `worldMat4sFromLocals`, `worldPoseBoneMatrices4FusedFkAndSolved` (FK side) |
| Tip snap helper | `bone3dPose.ts` — `snapPlanarChildTranslationToParentTip` |
| Pose package output | `packages/domain/src/editor/rig/evaluatePose.ts` (FK columns of `PoseState`) |

---

## 9. Next

**Inverse kinematics (targets, poles, two-bone, FABRIK, overrides):** **[18-editor-inverse-kinematics.md](./18-editor-inverse-kinematics.md)**.
