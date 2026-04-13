# UI & Workflow

## Designziele

- **Editor-first:** Panels sind modular; Standard-Layout: Viewport + Hierarchy + Timeline + Inspector.
- **Tastatur:** Space = Play/Pause, ←/→ Frame Step (konfigurierbar später), Ctrl+Z / Ctrl+Y Undo/Redo.
- **Lesbarkeit:** Hoher Kontrast, skalierbare Schrift; Theme später (Hell/Dunkel MVP-fähig).

## Haupt-Workflows (MVP)

### A. Rig erstellen

1. Neues Projekt → Root-Knochen existiert standardmäßig oder wird angelegt.
2. Knochen hinzufügen, Parent setzen, im Viewport verschieben (Bind Pose).
3. Optional: Sprite an Knochen binden (Attachment).

### B. Animieren

1. Zeit scrubben, Knochen auswählen, Werte setzen → Keyframe.
2. Linear/Hold-Interpolation (MVP: linear reicht für erste Keys).
3. Loop-Preview.

### C. Exportieren

1. „Export Runtime JSON“ → Zielordner wählen.
2. Validierung: Fehlerliste bei Problemen; bei Erfolg **Export-Log** (kurz).

## Viewport-Interaktion

- **Selektion:** Klick auf Knochen (Hit-Test über vereinfachte Linien/Points).
- **Gizmo:** Move/Rotate (Rotate MVP-priorisiert je nach Aufwand).
- **Zoom/Pan:** Mausrad, mittlere Maustaste / Space+Drag (konvention festlegen).

## Timeline

- Eine **globale** Timeline für MVP (mehrere Clips = Post-MVP).
- Key-Darstellung: Diamanten pro Track-Kanal oder gebündelt pro Knochen (UX-Entscheid im Implementierungs-Issue).

## Inspector

- Zeigt: Name, Parent, Transform (Bind Pose vs. animierte Werte klar trennen — Labels „Bind“ / „Current“).

## Fehlermeldungen (UX)

- Kurzer Titel + **technische Details** ausklappbar (für Issue-Reports).
- Export-Fehler referenzieren **Feld-Pfade** im JSON-Pendant (z. B. `animations[0].tracks[2].boneId`).

## Internationalisierung

- MVP: **Englisch** oder **Deutsch** — eine Sprache für UI-Strings, i18n-Keys von Anfang an strukturieren (`vue-i18n`), auch wenn nur eine Locale aktiv ist.
