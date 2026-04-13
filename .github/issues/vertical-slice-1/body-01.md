## Kontext

Teil von **Vertical Slice 1** (Phase 1 MVP): End-to-End Rig → Export → Godot.

Plan: `docs/14-vertical-slice-1-tasks.md` (Task 1)

## Lieferobjekt

Typen + reine Funktionen für minimales **Editor-Projekt** (nicht identisch mit Runtime-DTO): `Armature`, `Bone` (id, parentId, name, bindPose), optional leere `animations`-Struktur; `validateProject(project): ValidationIssue[]`.

## Akzeptanzkriterien

- [ ] Keine Vue- oder Tauri-Imports in `@skelio/domain`.
- [ ] Unit-Tests: gültiger Baum; Zyklus in Parent-Kette wird erkannt; fehlende Referenzen werden gemeldet.

## Doku

- `docs/04-datenmodell-schema.md`
- `docs/06-designpatterns-konventionen.md`
- `docs/adr/0007-runtime-koordinaten-rotation.md`

## Abhängigkeiten

Blockiert nichts; **Blocker für** Task 2 (Commands auf diesem Modell).
