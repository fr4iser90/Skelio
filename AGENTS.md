# Agents / AI — Short briefing

1. Read **`docs/README.md`** (index **00–18**, including **`docs/16-character-setup-animate-boundary.md`**, **`docs/17-editor-forward-kinematics.md`** for FK, **`docs/18-editor-inverse-kinematics.md`** for IK — separate docs) and, for architecture decisions, **`docs/adr/`**. **Never mix Character Setup (rigging) with Animate (keyframes)** — see doc 16.
2. **Runtime export** is contractual: **`docs/04-data-model-schema.md`** + **`schemas/runtime-1.1.0.json`** (older: `runtime-1.0.0.json`). Change it only with an **ADR** and fixture/test updates.
3. **Layers:** No Vue or Tauri imports in `packages/domain`. UI talks to **`packages/application`** via commands — see **`docs/05-module-boundaries.md`**, **`docs/06-design-patterns-and-conventions.md`**.
4. Delivery phases / MVP checklist: **`docs/14-vertical-slice-1-tasks.md`**.
5. Repo-root commands:
   - `pnpm install`
   - `pnpm test` — package tests
   - `pnpm typecheck`
   - `pnpm dev` — desktop app (Rust/Tauri for full native window)

Cursor rules derivation: **`docs/13-ai-assisted-development.md`**.
6. **Language:** Code comments, JSDoc on new/changed code, and user-facing error strings in source should be **English**. Do not add German (or other non-English) comments in application or package source unless the file already uses that language consistently for UI copy.
