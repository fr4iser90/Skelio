# 04 — Data model and runtime schema

The **runtime export** is a JSON document validated by **`schemas/runtime-1.1.0.json`**. Older parsers may still reference `runtime-1.0.0.json`; new work should target **1.1.0**.

## Top-level object

Required keys: `schemaVersion`, `meta`, `assets`, `armature`, `animations`, `skins`.

| Key | Meaning |
|-----|--------|
| `schemaVersion` | Semver string, e.g. `"1.1.0"` |
| `meta` | `name`, `fps`, `duration`, `coordinateSystem` (must be `"y-down"`) |
| `assets` | Textures and other asset refs |
| `armature` | `bones[]`, `attachments[]` |
| `animations` | Clips with `tracks` / `channels` / keyframes |
| `skins` | 2D skinned triangle meshes: `vertices`, `indices`, per-vertex `influences` |

## Conventions (high level)

- **camelCase** property names in JSON.
- Animation time on keyframes: **`t` in seconds** (not frames), aligned with `meta.fps` for sampling policy in runtimes.
- **2D transforms** on bones/attachments use `transform2d`: `x`, `y`, `rotation`, `sx`, `sy`.

## Source of truth

1. **`schemas/runtime-1.1.0.json`** — authoritative structure and constraints.
2. **`schemas/CHANGELOG.md`** — semver notes when the contract changes.
3. **`RUNTIME_SCHEMA_VERSION`** in `@skelio/domain` — must match the exporter output.

## Changing the contract

Any incompatible or material change needs: **ADR**, schema version bump, fixtures/tests under `packages/domain`, and consumer notes (Godot, etc.).
