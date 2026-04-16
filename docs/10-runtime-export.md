# 10 — Runtime export

## Responsibility

Mapping from **`EditorProject`** (editor-internal) to **runtime JSON** (external contract) lives in `@skelio/domain` export helpers (e.g. `runtimeExport.ts`) and must stay aligned with:

- `schemas/runtime-1.1.0.json`
- `RUNTIME_SCHEMA_VERSION` constant

## Versioning

Bump **schema SemVer** when the contract changes incompatibly or when new required fields appear. Document in `schemas/CHANGELOG.md` and add an **ADR**.

## Skins

`1.1.0` requires a **`skins`** array (may be empty). Meshes use bind-space vertices, triangle `indices`, and per-vertex `influences` (bone id + weight).

## Consumers

Godot and other runtimes should validate against the JSON Schema where possible, or use generated types if the project adds them later.
