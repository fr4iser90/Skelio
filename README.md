# Skelio

Quelloffener 2D-**Skeletal-Animation**-Editor mit Fokus auf **Runtime-JSON** und **Godot** (Vue + Tauri Desktop).

## Schnellstart (Entwicklung)

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

- **`pnpm dev`:** nur Vite (Browser `http://localhost:1420/`). **`pnpm tauri dev`** im Ordner `apps/skelio-desktop`: natives Fenster — **Rust** + [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/).
- **`pnpm test`:** Pakete unter `packages/*`.

## Dokumentation

- **Planung & Architektur:** [docs/README.md](docs/README.md)
- **ADRs:** [docs/adr/README.md](docs/adr/README.md)
- **Mitwirken:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **KI / Agenten:** [AGENTS.md](AGENTS.md)

## Lizenz

Siehe [LICENSE](LICENSE) (GNU GPLv3).
