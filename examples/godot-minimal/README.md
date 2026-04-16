# Godot minimal example (Skelio)

Goal: a **Godot 4.x** scene that loads **runtime JSON** from Skelio and plays a minimal pose (see `docs/11-godot-integration.md`).

## Requirements

- **Godot 4.2 or newer** (4.x; if in doubt, use a current 4.x minor).

## Usage

1. Start Godot and **Import** this folder as the project (`project.godot`).
2. Run the main scene (F5): `main.tscn` is the run scene.
3. Default JSON: `fixtures/runtime-minimal.valid.json` (root bone moves on X over 1 s, loop; one **skinned quad** follows the bone via linear blend skinning).
4. Your own export: on the `SkelioPlayer` node, set **Runtime Json Path** to a `res://…` or absolute file (JSON should match `schemas/runtime-1.1.0.json`; `skins` is an array of triangle meshes).

## Components

- **`SkelioPlayer`** (`skelio_player.gd`): loads the first animation, builds world matrices (bind/pose) like the domain export, **deforms** `skins[]` with linear blend skinning (weights × pose·bind⁻¹), draws meshes and a point per bone origin; optional **label** with root position, time, and skin count.

## Status

Working reference path for Vertical Slice 1 (Godot side); not a full add-on package.
