# 11 — Godot integration

Skelio targets **Godot** as a primary runtime consumer of the exported JSON.

## Current guidance

1. Treat **`schemas/runtime-1.1.0.json`** as the structural contract.
2. Respect **`meta.coordinateSystem`: `y-down`** when mapping to Godot’s transform conventions.
3. Load textures from `assets`, bones from `armature`, clips from `animations`, meshes from `skins`.

## Gaps

Sample projects, official import plugins, and step-by-step tutorials may still be missing or incomplete. Track implementation tasks in issues and cross-link from [15-product-gaps-and-roadmap.md](./15-product-gaps-and-roadmap.md) when files exist.
