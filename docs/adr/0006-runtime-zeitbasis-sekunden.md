# ADR-0006: Runtime-Zeitbasis in Sekunden

## Status

angenommen

## Kontext

Keyframes müssen engine-neutral und frame-rate-unabhängig gespeichert werden. Alternative: ganzzahlige Frames bei fixer FPS — führt zu Rundungsproblemen und Export-Drift.

## Entscheidung

1. Alle Key-Zeiten im **Runtime-JSON** sind **Sekunden** (`number`, Gleitkomma), Feld **`t`** pro Key (siehe [04-datenmodell-schema.md](../04-datenmodell-schema.md)).
2. `meta.fps` ist **Anzeige-/Sampling-Hinweis**, keine kanonische Zeitbasis.
3. `meta.duration` / Animations-`length` beschreiben die Spanne in Sekunden.

## Konsequenzen

### Positiv

- Godot `_process(delta)` passt natürlich zu Sekunden.
- Wechsel der Editor-FPS ändert nicht die gespeicherte Kurve.

### Negativ / Kosten

- Frame-snapping im Editor ist eine reine UI-Schicht (konvertiert Frames → Sekunden für Keys).

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)
- [02-anforderungen-mvp.md](../02-anforderungen-mvp.md) (F-MVP-03)
