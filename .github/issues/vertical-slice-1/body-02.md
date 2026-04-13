## Kontext

Vertical Slice 1 — Task 2. Plan: `docs/14-vertical-slice-1-tasks.md`

## Lieferobjekt

`Command`-Schnittstelle + Handler für mindestens: `AddBone`, `RemoveBone`, `SetBindPose`, `SetKeyframe` (nur `tx` / `ty` / `rot`, Zeit in **Sekunden**); **Undo/Redo**-Stack (Strategie in Doku/ADR festhalten).

## Akzeptanzkriterien

- [ ] Ketten von Commands + Undo in Tests reproduzierbar.
- [ ] Spätere UI ruft nur diese Application-API auf (in diesem Task reichen Tests ohne vollständige UI).

## Doku

- `docs/05-modulgrenzen-schnittstellen.md`
- `docs/06-designpatterns-konventionen.md`
- `docs/adr/0006-runtime-zeitbasis-sekunden.md`

## Abhängigkeiten

Benötigt Task 1 (Domänenmodell + Validierung).
