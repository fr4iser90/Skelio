## Kontext

Vertical Slice 1 — Task 5. Plan: `docs/14-vertical-slice-1-tasks.md`

## Lieferobjekt

Pinia oder schlanke Composables: **ein** `projectStore`, der Commands aus Task 2 auslöst. UI: **Hierarchy** (Liste/Baum) + **Inspector** für einen Bone (Name, Parent, Bind-Pose). Optional: rudimentärer **Viewport** (Linien) gemäß ADR Canvas — sonst zuerst Zahlen-Editor.

## Akzeptanzkriterien

- [ ] Knochen hinzufügen/umbenennen über UI; mit Task 3 speicherbar.
- [ ] Keine Domäneninvarianten in `.vue` dupliziert.

## Doku

- `docs/07-ui-workflow.md`
- `docs/03-systemarchitektur.md`
- `docs/adr/0003-viewport-rendering-mvp.md`

## Abhängigkeiten

Benötigt Task 2 und Task 3 (Persistenz zum Speichern).
