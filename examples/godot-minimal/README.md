# Godot-Minimalbeispiel (Skelio)

Ziel: eine **Godot 4.x**-Szene, die ein **Runtime-JSON** aus Skelio lädt und eine minimale Pose animiert (siehe `docs/08-godot-integration.md`, ADR-0005 GDScript).

## Voraussetzungen

- **Godot 4.2 oder neuer** (4.x; bei Problemen eine aktuelle 4.x-Minorversion nutzen).

## Nutzung

1. Godot starten und **Projekt importieren** mit diesem Ordner (`project.godot`).
2. Hauptszene starten (F5): `main.tscn` ist die Run-Szene.
3. Standard-JSON: `fixtures/runtime-minimal.valid.json` (Root-Knochen bewegt sich auf der X-Achse über 1 s, Schleife; ein **skinned Quad** folgt dem Bone via Linear Blend Skinning).
4. Eigenes Export-JSON: im Inspektor beim Knoten `SkelioPlayer` **Runtime Json Path** auf eine `res://…`- oder absolute Pfad-Datei setzen (JSON sollte zu `schemas/runtime-1.1.0.json` passen; `skins` ist ein Array von Dreiecks-Meshes).

## Komponenten

- **`SkelioPlayer`** (`skelio_player.gd`): lädt die erste Animation, baut Welt-Matrizen (Bind/Pose) wie im Domain-Export, **deformiert** `skins[]` per Linear Blend Skinning (Gewichte × Pose·Bind⁻¹), zeichnet Meshes und einen Punkt pro Knochen-Ursprung; optional **Label** mit Root-Position, Zeit und Skin-Anzahl.

## Status

Funktionsfähiger Referenzpfad für Vertical Slice 1 (Godot-Seite); kein vollständiges Addon-Paket.
