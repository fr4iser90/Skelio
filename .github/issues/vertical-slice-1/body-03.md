## Kontext

Vertical Slice 1 — Task 3. Plan: `docs/14-vertical-slice-1-tasks.md`

## Lieferobjekt

Lesen/Schreiben eines **Ordnerprojekts** (`docs/adr/0004-projekt-persistenz-ordnerprojekt.md`): Manifest `project.skelio.json` (Editor-Schema inkl. Version-Feld), `assets/` mit referenzierten/kopierten Dateien; klare Fehler bei fehlenden Pfaden.

## Akzeptanzkriterien

- [ ] Roundtrip: speichern → laden → strukturell gleiche Domäne; Test mit temporärem Verzeichnis.

## Doku

- `docs/04-datenmodell-schema.md` (Editor vs Runtime)
- `docs/10-teststrategie-qualitaet.md`

## Abhängigkeiten

Benötigt Task 2 (stabiler Projekt-Snapshot durch Commands).
