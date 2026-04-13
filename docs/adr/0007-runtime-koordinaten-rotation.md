# ADR-0007: Runtime-Koordinaten (Y-down) & Rotation (Radiant)

## Status

angenommen

## Kontext

Godot 2D nutzt typischerweise **Y nach unten**. Rotation und Einheiten müssen zwischen Editor-Export und Engine **einmalig** festgelegt sein, sonst entstehen stille Fehler.

## Entscheidung

1. **`meta.coordinateSystem`** im Runtime-Export ist verpflichtend; erlaubter Wert im MVP: **`"y-down"`** (weitere Werte später per Schema-Minor).
2. **Position** `x`, `y` in **Pixel** (oder logischen Editor-Einheiten), gleiche Einheit wie Attachments; dokumentiert als „Engine-Units“.
3. **Rotation** `rotation` in **Radiant**, mathematisch positiv **gegen den Uhrzeigersinn** (Standard); Godot-Code mappt bei Bedarf explizit (siehe [08-godot-integration.md](../08-godot-integration.md)).

## Konsequenzen

### Positiv

- Nahe an Godot-2D-Erwartung für Translation/Layout.

### Negativ / Kosten

- Editor-Viewport muss beim Export ggf. **Y spiegeln** oder intern einheitlich in `y-down` modellieren — Umsetzung im Implementierungs-Issue festhalten.

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)
- [08-godot-integration.md](../08-godot-integration.md)
