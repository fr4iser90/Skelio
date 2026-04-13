# Changelog — Runtime JSON Schema

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/).

## [1.1.0] — unveröffentlicht

- Neues Pflichtfeld **`skins`**: Array von 2D-Skinned-Meshes (Bind-Space, Dreiecke, `influences` pro Vertex). Leeres Array, wenn keine Meshes exportiert werden.
- Datei: `schemas/runtime-1.1.0.json`. Editor/Exporter nutzen `schemaVersion: "1.1.0"`.

[1.1.0]: #

## [1.0.0] — unveröffentlicht

- Erstes Schema `runtime-1.0.0.json` gemäß `docs/04-datenmodell-schema.md` und ADR 0002, 0006–0008.
- **Hinweis:** Neue Features nutzen **1.1.0**; 1.0.0 bleibt zur Referenz für ältere Parser.

[1.0.0]: #
