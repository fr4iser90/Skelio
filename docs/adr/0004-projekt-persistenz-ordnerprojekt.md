# ADR-0004: Projekt-Persistenz als Ordnerprojekt (MVP)

## Status

angenommen

## Kontext

Editor-Projekte müssen Assets (Texturen) und strukturierte Daten speichern. Optionen: **einzelnes Archiv (ZIP)** vs. **Ordner** mit Manifest + relativen Pfaden.

## Entscheidung

**MVP:** Ordnerprojekt mit zentraler Manifest-Datei (Name z. B. `project.skelio.json`) und Unterordner `assets/` für binäre Dateien. Pfade im Manifest **relativ zum Projektroot**.

## Alternativen

- **ZIP-Single-File:** besser zum Teilen, schlechter für Git-Diffs und partielle Updates ohne Entpacken.

## Konsequenzen

### Positiv

- Git-freundlich, einfaches Debugging, klare Pfade für Godot-Beispiele.

### Negativ / Kosten

- Nutzer müssen „Ordner öffnen“ statt einer Datei (Tauri: Ordner-Picker).

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)
