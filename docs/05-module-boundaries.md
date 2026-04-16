# 05 — Module boundaries

## `@skelio/domain`

- **Allowed:** TypeScript-only logic, math, pure functions, editor project types, pose evaluation, validation, export mapping.
- **Forbidden:** `vue`, `@tauri-apps/*`, ad-hoc `fs` in types that should stay portable, UI strings as behavior drivers.

## `@skelio/application`

- Applies **commands** to `EditorProject`; central place for “what happens when user does X”.
- May depend on domain; must not import Vue.

## `@skelio/infrastructure`

- Serialization, paths, file reads/writes.
- No UI; keep side effects explicit.

## `apps/skelio-desktop`

- Vue components, Pinia, Tauri APIs.
- **Must not** embed domain rules by mutating shared project objects ad hoc; go through the command / store dispatch path.

## Tests

- Domain tests live under `packages/domain`; they are the safety net for pose math and export.
