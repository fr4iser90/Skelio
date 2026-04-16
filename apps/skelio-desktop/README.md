# Skelio Desktop (Vue + Tauri)

## Folder project (ADR-0004 when documented)

- The project folder contains **`project.skelio.json`** (editor state) and **`assets/`** (for binary assets; created on save).
- In the desktop app: **Open folder…** / **Save folder** — the path is set via an **input dialog** (no native folder picker in this version so Linux builds can avoid a GTK dialog toolchain).

## Development

```bash
pnpm --filter @skelio/desktop tauri dev
```

Prerequisites: [Tauri (Linux and others)](https://tauri.app/start/prerequisites/).
