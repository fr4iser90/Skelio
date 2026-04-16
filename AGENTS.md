# Agents / AI — Short briefing

1. Read **`docs/README.md`** (full index **00–15**) and, for architecture decisions, **`docs/adr/`**.
2. **Runtime export** is contractual: **`docs/04-data-model-schema.md`** + **`schemas/runtime-1.1.0.json`** (older: `runtime-1.0.0.json`). Change it only with an **ADR** and fixture/test updates.
3. **Layers:** No Vue or Tauri imports in `packages/domain`. UI talks to **`packages/application`** via commands — see **`docs/05-module-boundaries.md`**, **`docs/06-design-patterns-and-conventions.md`**.
4. Delivery phases / MVP checklist: **`docs/14-vertical-slice-1-tasks.md`**.
5. Repo-root commands:
   - `pnpm install`
   - `pnpm test` — package tests
   - `pnpm typecheck`
   - `pnpm dev` — desktop app (Rust/Tauri for full native window)

Cursor rules derivation: **`docs/13-ai-assisted-development.md`**.
