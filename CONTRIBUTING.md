# Mitwirken an Skelio

Vielen Dank für dein Interesse. Bitte orientiere dich zuerst an **[docs/README.md](docs/README.md)** und den **ADRs** unter `docs/adr/`.

## Entwicklungsumgebung

- **Node** (LTS empfohlen) und **pnpm** (Version siehe `packageManager` in der Root-`package.json`).
- **Rust** und die [Tauri-Voraussetzungen](https://tauri.app/start/prerequisites/) für dein Betriebssystem (unter Linux z. B. `webkit2gtk`).

## Erste Schritte

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm dev` startet die **Desktop-App** unter `apps/skelio-desktop`. Ohne installiertes Rust schlägt `tauri`-Teil fehl — dann zumindest `pnpm --filter @skelio/desktop dev` nur für Vite prüfen (ohne Tauri-CLI), oder Rust nachinstallieren.

## GitHub-Issues: Vertical Slice 1

Die acht MVP-Slice-Aufgaben können per GitHub CLI erzeugt werden (Beschreibungstexte liegen im Repo):

1. [`gh`](https://cli.github.com/) installieren, `gh auth login`
2. `./scripts/create-vertical-slice-1-issues.sh`

Details: `.github/issues/vertical-slice-1/README.md` · Plan: `docs/14-vertical-slice-1-tasks.md`

## Pull Requests

- Kleine, fokussierte PRs mit klarer Beschreibung.
- Änderungen am **Runtime-JSON**: `schemas/`, `docs/04-datenmodell-schema.md`, **ADR** und Tests/Fixtures anpassen.
- Keine Domänenlogik in `.vue`-Dateien — siehe `docs/06-designpatterns-konventionen.md`.

## Verhalten

Es gilt ein [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant).
