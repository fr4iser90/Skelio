# Changelog — Runtime JSON schema

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] — unreleased

- New required field **`skins`**: array of 2D skinned meshes (bind space, triangles, per-vertex `influences`). Empty array when no meshes are exported.
- File: `schemas/runtime-1.1.0.json`. Editor/exporter use `schemaVersion: "1.1.0"`.

[1.1.0]: #

## [1.0.0] — unreleased

- First schema `runtime-1.0.0.json` per `docs/04-data-model-schema.md` and ADRs 0002, 0006–0008 (when those ADRs exist in the repo).
- **Note:** New features target **1.1.0**; 1.0.0 remains a reference for older parsers.

[1.0.0]: #
