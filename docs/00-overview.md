# 00 — Overview

**Skelio** is an open-source **2D skeletal animation** editor focused on a **portable runtime JSON** contract and **Godot** as a primary consumer. The desktop app is built with **Vue** and **Tauri** (Rust).

## What exists today

- Editor project model (bones, clips, keys, rigs, optional skinned meshes, character-rig slices).
- Deterministic pose evaluation in `@skelio/domain` (FK sampling, two-bone IK, planar FABRIK chains, fusion into solved pose).
- Desktop UI for authoring, timeline, viewport modes (2D / 2.5D / 3D camera flavors), and inspector-driven workflows.
- Runtime export aligned with `schemas/runtime-1.1.0.json` (`RUNTIME_SCHEMA_VERSION` in `@skelio/domain`).

## What this is not (yet)

- A drop-in replacement for proprietary tools’ full feature sets (advanced IK/FK UX, mesh authoring parity, production polish).
- A Spine importer; the north star is Skelio’s own format and open pipeline.

## Where to read next

- Architecture: [03-system-architecture.md](./03-system-architecture.md)
- Data contract: [04-data-model-schema.md](./04-data-model-schema.md)
- Honest backlog: [15-product-gaps-and-roadmap.md](./15-product-gaps-and-roadmap.md)
