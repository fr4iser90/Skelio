# 16 — Character Setup vs Animate (hard boundary)

This document is **contractual for contributors and agents**: the two concerns must **never** be mixed in behavior or naming.

## Definitions

| Concern | Purpose | Where it runs | Data |
|--------|---------|----------------|------|
| **Character Setup** | Guided **rigging** only: parts, bones, binding, depth, meshes for a character rig. | **Modal** (`CharacterRigModal.vue` + `CharacterRigThreeViewport.vue`). | Edits go to **`characterRigDraftProject`** until **Done** merges into `project`. **Cancel** / **×** / **Esc** discards the draft (`discardCharacterRigModal`). |
| **Animate** | **Playback and keyframing** on the committed skeleton/project. | **Main editor** (`AnimatorThreeViewport.vue`, timeline, inspector when bind pose is locked). | Uses **`project`** via `rigEditProject` (draft is `null` when Setup is closed). No bind-pose editing in the main view. |

There is **no separate “Rig” or “Export” workspace** in the shell: export lives under **File**, rigging only under **Character Setup…**.

## Rules (must hold)

1. **While Character Setup is open**, the main viewport region shows **`CharacterRigThreeViewport`** (bind / rig paths), not the animator pose — see `ViewportPanel.vue` (`characterRigModalOpen`).
2. **`evaluatePose` for Character Setup** uses **time `0`** (bind/rest), not `store.currentTime` (Animate timeline). Implemented in `CharacterRigThreeViewport.vue` (wizard only).
3. **Leaving Setup** is explicit only: **Done** (`applyCharacterRigModal`) merges the draft; **Cancel** / discard paths call `discardCharacterRigModal`. There is no “switch tab to commit” behavior.
4. **Persistence**: saving (folder or file) uses `activeProjectForPersistence()` which prefers the wizard draft when open; that is intentional for “save while in Setup”, not “Animate mixing”.

## Primary files (do not blur responsibilities)

| File | Role |
|------|------|
| `apps/skelio-desktop/src/stores/editor.ts` | `characterRigDraftProject`, `openCharacterRigModal`, `applyCharacterRigModal`, `discardCharacterRigModal`, `rigEditProject` |
| `apps/skelio-desktop/src/components/CharacterRigModal.vue` | Character Setup **UI shell** (wizard steps). |
| `apps/skelio-desktop/src/components/CharacterRigThreeViewport.vue` | Setup **3D / depth** viewport; rig camera. |
| `apps/skelio-desktop/src/components/ViewportPanel.vue` | Chooses **Setup** vs **Animate** viewport from `characterRigModalOpen` only. |
| `apps/skelio-desktop/src/components/ToolbarPanel.vue` | **Character Setup…** entry; animator toggles on the second row (no workspace tabs). |

## Anti-patterns

- Gating Character Setup viewport behavior on anything other than **`characterRigModalOpen`** (causes timeline pose to leak into Setup).
- Calling `evaluatePose(..., currentTime)` from Character Setup **3D** (Bind / depth) — use time **`0`** only.
- Exposing bind-pose / skeleton-structure editing in the **main** view (forbidden — gate on `characterRigModalOpen` in Inspector / Hierarchy / viewport tools).

## Related

- [08-desktop-application.md](./08-desktop-application.md)
- [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md)
