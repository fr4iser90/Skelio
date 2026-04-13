# ADR-0008: Runtime-JSON Property-Namen (camelCase)

## Status

angenommen

## Kontext

JSON-Keys können `snake_case` oder `camelCase` sein. Engines und TypeScript-Ökosysteme sind uneinheitlich; eine feste Konvention reduziert Mapping-Fehler.

## Entscheidung

Alle **öffentlichen** Keys im **Runtime-Export** und in den **JSON-Schema**-Dateien unter `schemas/` verwenden **`camelCase`**.

## Konsequenzen

### Positiv

- Nahtlose Nutzung in TypeScript/JavaScript und typischen Godot-Dictionaries ohne Umbenennung.

### Negativ / Kosten

- GDScript-Nutzer können `snake_case`-Stil nicht in den Rohdaten erwarten — nur in ihrem eigenen Code.

## Referenzen

- [06-designpatterns-konventionen.md](../06-designpatterns-konventionen.md)
- `schemas/runtime-1.0.0.json` / `schemas/runtime-1.1.0.json` (gleiche Namenskonvention)
