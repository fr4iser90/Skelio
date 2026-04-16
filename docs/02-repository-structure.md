# 02 — Repository structure

Monorepo managed with **pnpm** workspaces.

## `apps/`

| Path | Role |
|------|------|
| `apps/skelio-desktop/` | Vue + Tauri desktop shell, Pinia store, viewport and panels |

## `packages/`

| Package | Role |
|---------|------|
| `@skelio/domain` | Pure editor/runtime domain logic: types, pose evaluation, validation, export helpers — **no Vue/Tauri** |
| `@skelio/application` | Command application / reducers over `EditorProject` |
| `@skelio/infrastructure` | File I/O, serializers (no UI) |

Other packages may appear as the repo grows; treat `package.json` `"name"` fields as source of truth.

## `schemas/`

JSON Schema for **runtime export** (`runtime-1.1.0.json` current). See [04-data-model-schema.md](./04-data-model-schema.md).

## `docs/`

Human-readable architecture, process, and backlog (this tree).

## `assets/`

Sample meshes and fixtures for development and tests.
