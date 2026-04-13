# Godot-Integration

## Ziel

Godot ist **first-class** im Sinne von: Der Runtime-Export ist so dokumentiert und referenziert, dass ein Godot-Projekt **ohne** kommerzielle Zwischentools die Animation abspielen kann.

## Referenz-Sprache

Die offizielle Referenz-Runtime und alle MVP-Beispiele werden in **GDScript** umgesetzt — siehe **[ADR-0005](adr/0005-godot-referenz-runtime-gdscript.md)**. C# ist kein MVP-Pflichtpfad; die Schnittstelle bleibt das **JSON-Schema**.

## Komponenten

1. **JSON-Datei(en)** — gemäß [04-datenmodell-schema.md](04-datenmodell-schema.md).
2. **Texturen / Assets** — relative Pfade; Godot `.import` entsteht durch Editor-Import der Texturen.
3. **Runtime-Code** — Addon oder Beispielprojekt:
   - `SkelioPlayer` (Node2D oder Node): lädt JSON, baut interne Knochen-Repräsentation.
   - `advance(delta)` oder Nutzung in `_process`.

## Koordinaten-Mapping

**Pflicht:** Im Export-Feld `coordinateSystem` dokumentieren und im Godot-Code konsistent transformieren (z. B. Y-Flip, Rotation-Richtung).

Tabelle im ADR ergänzen, sobald der erste vertikale Slice steht.

## Szeneaufbau (empfohlen)

```
Character (Node2D)
├── SkelioPlayer (lädt runtime.json)
│   └── (generierte Bone-Nodes oder interne Matrixliste + ein Sprite-Container)
```

Alternative: **Single Node** ohne Kind-Knoten pro Bone (performanter) — für MVP akzeptabel, wenn dokumentiert.

## Animation

- Sampling pro Frame oder Zeit: `samplePose(time)` aus Daten (linear zwischen Keys).
- **Root motion** (später): nicht MVP.

## Testen in Godot

- **Minimal-Szene** im Repo `examples/godot-minimal/` (wird bei Implementierung angelegt):
  - Lädt festes Fixture-JSON.
  - Screenshot- oder Positions-Assert (manuell zuerst, später automatisierbar mit Godot Headless falls gewünscht).

## Versionierung

- Godot-Addon trägt eigene Version; Kompatibilitätstabelle:

| Skelio `schemaVersion` | Addon `minVersion` |
|--------------------------|--------------------|
| 1.0.0 | 1.0.0 |

Tabelle in Addon-README pflegen.

## Lizenz-Hinweis

Runtime-Code im **selben** Repository wie der Editor fällt unter die **GPLv3** des Projekts. Lizenzheader in neuen Dateien einheitlich (bei Implementierung). Soll der Godot-Teil später separat unter einer permissiven Lizenz laufen, ist das eine **eigene** Lizenz-/Repo-Entscheidung (ADR).
