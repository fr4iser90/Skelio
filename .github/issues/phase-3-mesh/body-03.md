## Kontext

**Phase 3 — Mesh & Skinning.** Weight Paint ist der Haupt-UX-Aufwand für Skinning.

## Lieferobjekt

- **Weight Paint** (MVP): Pinsel oder Vertex-Auswahl minimal; Zuordnung Vertex → Knochen-Gewichte (max. Influences laut Schema).
- **Validierung** im Domain-Layer: Summen/Normalisierung wo nötig, konsistente Bone-IDs.
- Undo/Redo über bestehende Command-Architektur wo möglich.

## Akzeptanzkriterien

- [ ] Gewichte sind persistiert (Editor-Projekt) und in den Runtime-Export einplanbar (wenn Schema steht).
- [ ] Keine Domänenlogik nur in `.vue`-Komponenten (siehe Architektur-Doku).

## Doku

- `docs/06-designpatterns-konventionen.md`
- `docs/07-ui-workflow.md`

## Abhängigkeiten

Braucht klares Mesh-Bind-Setup (Issue Mesh-Asset/Bind-Pose) und idealerweise Schema für Gewichte.
