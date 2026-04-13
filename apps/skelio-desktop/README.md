# Skelio Desktop (Vue + Tauri)

## Ordnerprojekt (ADR-0004)

- Im Projektordner liegen **`project.skelio.json`** (Editor-Zustand) und **`assets/`** (für spätere Binärdateien; wird beim Speichern angelegt).
- In der Desktop-App: **Ordner…** / **Ordner speichern** — der Pfad wird per **Eingabedialog** gesetzt (kein nativer Ordner-Picker in dieser Version, damit Linux-Builds ohne GTK-Dialog-Toolchain auskommen).

## Entwicklung

```bash
pnpm --filter @skelio/desktop tauri dev
```

Voraussetzungen siehe [Tauri (Linux)](https://tauri.app/start/prerequisites/).
