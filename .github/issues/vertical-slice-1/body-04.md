## Kontext

Vertical Slice 1 — Task 4. Plan: `docs/14-vertical-slice-1-tasks.md`

## Lieferobjekt

`mapProjectToRuntime(project): RuntimeJson` (Anti-Corruption Layer). Ausgabe validiert gegen `schemas/runtime-1.0.0.json`; Test oder CI validiert Fixture + einen exportierten Minimalfall.

## Akzeptanzkriterien

- [ ] `schemaVersion` und `meta.coordinateSystem: "y-down"` immer gesetzt.
- [ ] Validierungsfehler als strukturierte Liste (Pfad/Feld) für spätere UI.

## Doku

- `docs/04-datenmodell-schema.md`
- `schemas/CHANGELOG.md`
- `docs/adr/0007-runtime-koordinaten-rotation.md`, `docs/adr/0008-runtime-json-camelcase.md`
- `docs/10-teststrategie-qualitaet.md`

## Abhängigkeiten

Kann parallel zu Task 3 beginnen, sobald Task 1 steht; für echte Exportdaten sinnvoll nach Task 2.
