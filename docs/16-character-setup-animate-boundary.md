# 16 — Character Setup vs Animate (hard boundary)

This document is **contractual for contributors and agents**: the two concerns must **never** be mixed in behavior or naming.

## Definitions

| Concern | Purpose | Workspace tab | Data |
|--------|---------|-----------------|------|
| **Character Setup** | Guided **rigging** only: parts, bones, binding, depth, meshes for a character rig. | **Rig** (opening the wizard forces `workspaceMode === "rig"`). | Edits go to **`characterRigDraftProject`** until **Done** merges into `project`. |
| **Animate** | **Playback and keyframing** on the **committed** skeleton/project. | **Animate** | Reads **`project`** only. No bind-pose editing while animating. |

Character Setup does **not** “live inside” Animate. You **finish** rigging, apply the wizard, then **switch to Animate** to animate. Animate is the consumer of the rig data you authored in Setup/Rig.

## Rules (must hold)

1. **While Character Setup is open**, the main 2D viewport must use **rig / bind-pose** drawing paths, not timeline-driven pose — see `ViewportPanel.vue` (`rigWizardBindLayoutViewport`, etc.).
2. **`evaluatePose` for Character Setup** uses **time `0`** (bind/rest), not `store.currentTime` (Animate timeline). Implemented in `ViewportPanel.vue` (`solvedPose`) and `CharacterRigThreeViewport.vue` (only used inside the wizard).
3. **Switching to Animate** calls `setWorkspaceMode("animate")`, which **discards** an open Character Setup wizard (`discardCharacterRigModal`) so animation mode cannot accidentally keep editing a draft rig.
4. **Opening Character Setup** sets **`workspaceMode` to `"rig"`** so the UI and viewport are not coupled to the Animate tab.
5. **Persistence**: saving (folder or file) uses `activeProjectForPersistence()` which prefers the wizard draft when open; that is intentional for “save while in Setup”, not “Animate mixing”.

## Primary files (do not blur responsibilities)

| File | Role |
|------|------|
| `apps/skelio-desktop/src/stores/editor.ts` | `characterRigDraftProject`, `openCharacterRigModal`, `applyCharacterRigModal`, `discardCharacterRigModal`, `workspaceMode`, `setWorkspaceMode` |
| `apps/skelio-desktop/src/components/CharacterRigModal.vue` | Character Setup **UI shell** (wizard steps). |
| `apps/skelio-desktop/src/components/CharacterRigThreeViewport.vue` | Setup **3D / depth** viewport; rig camera. |
| `apps/skelio-desktop/src/components/ViewportPanel.vue` | Main canvas: **splits** rig-wizard bind layout vs animator pose using `characterRigModalOpen` and workspace rules. |
| `apps/skelio-desktop/src/components/ToolbarPanel.vue` | Mode tabs Animate / Rig / Export; Character Setup entry. |

## Anti-patterns

- Gating Character Setup viewport behavior on `workspaceMode === "animate"` (causes timeline pose to leak into Setup).
- Calling `evaluatePose(..., currentTime)` from Character Setup **3D** (Bind / depth) — use time **`0`** only.
- Letting Animate tools edit bind pose while `workspaceMode === "animate"` without the wizard (forbidden — see `bindPoseViewportEditing`).

## Related

- [08-desktop-application.md](./08-desktop-application.md)
- [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md)
