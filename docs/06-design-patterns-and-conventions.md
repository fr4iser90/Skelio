# 06 — Design patterns and conventions

## Command-driven state

The UI expresses intent as **commands** processed by `@skelio/application`. Benefits:

- One place to audit valid transitions.
- Easier replay and testing compared to scattered mutations.

## Naming and style

- Match existing package style (ESM `.js` extensions in TS sources where the repo already does).
- Prefer small, focused modules over “god” files.

## Coordinates

Runtime contract uses **`y-down`** (`meta.coordinateSystem`). Internal editor math should stay consistent with documented transforms (see domain tests and [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md)).

## Vue components

- Presentation + wiring; **no duplicated domain rules** for pose, IK, or export.
- If logic grows, move it to `packages/domain` or `packages/application` first, then call from Vue.

## Internationalization

Product copy may be localized later; **developer documentation in `docs/` is English** so tooling and contributors share one language.
