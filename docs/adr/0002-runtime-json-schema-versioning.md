# ADR-0002: Runtime-JSON & Schema-Versionierung

## Status

angenommen

## Kontext

Game-Engines und Community-Tools brauchen einen **stabilen, maschinenlesbaren** Export. Breaking Changes ohne Versionierung zerstören Vertrauen und Kompatibilität (v. a. Godot-Addon).

## Entscheidung

1. Runtime-Export ist **JSON** mit Pflichtfeld `schemaVersion` (SemVer-String).
2. **Major-Version** erhöhen bei inkompatiblen Änderungen am veröffentlichten Contract (Feld entfernt/umbenannt, Semantik geändert).
3. **Minor** für rückwärtskompatible Erweiterungen (neue optionale Felder).
4. **Patch** für reine Klärungen in der Spezifikation ohne Auswirkung auf Parser (selten).
5. Nach Implementierungsbeginn: **JSON-Schema**-Dateien unter `schemas/` versionieren und in CI gegen Fixtures validieren.

## Konsequenzen

### Positiv

- Klare Upgrade-Pfade für Godot-Runtime und Dritttools.

### Negativ / Kosten

- Jede Änderung am Export erfordert disziplinierte Doku + Tests.

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)
- [10-teststrategie-qualitaet.md](../10-teststrategie-qualitaet.md)
