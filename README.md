# Skelio

Open-source **2D skeletal animation** editor focused on **runtime JSON** and **Godot** (Vue + Tauri desktop).

## Quick start (development)

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

- **`pnpm dev`:** Vite only (browser `http://localhost:1420/`). **`pnpm tauri dev`** in `apps/skelio-desktop`: native window — **Rust** + [Tauri prerequisites](https://tauri.app/start/prerequisites/).
- **`pnpm test`:** packages under `packages/*`.

## Documentation

- **Planning & architecture:** [docs/README.md](docs/README.md)
- **ADRs:** [docs/adr/README.md](docs/adr/README.md)
- **Contributing:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **AI / agents:** [AGENTS.md](AGENTS.md)

## License

See [LICENSE](LICENSE) (GNU GPLv3).
