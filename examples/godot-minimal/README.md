# Godot-Minimalbeispiel (Skelio)

Ziel: eine **Godot 4.x**-Szene, die ein **Runtime-JSON** aus Skelio lädt und eine minimale Pose zeigt (siehe `docs/08-godot-integration.md`, ADR-0005 GDScript).

## Voraussetzungen

- [Godot 4.x](https://godotengine.org/) (exakte Version beim ersten funktionierenden Slice in dieser README festhalten).

## Nutzung

1. Godot starten und **Projekt importieren** mit diesem Ordner (`project.godot`).
2. `main.tscn` öffnen und Szene starten.
3. Referenz-JSON liegt vorerst unter `fixtures/runtime-minimal.valid.json` (Kopie der Domain-Fixture); später ersetzt durch Export aus dem Editor.

## Status

Gerüst ohne vollständigen `SkelioPlayer` — nächster Implementierungsschritt nach Editor-Export.
