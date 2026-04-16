# Contributing to Skelio

Thanks for your interest. Start with **[docs/README.md](docs/README.md)** (index **00–15**) and **ADRs** under `docs/adr/`.

## Environment

- **Node** (LTS recommended) and **pnpm** (version in root `package.json` → `packageManager`).
- **Rust** and [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (on Linux e.g. `webkit2gtk`).

## First steps

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm dev` starts the **desktop app** under `apps/skelio-desktop`. Without Rust, the Tauri step may fail — then try `pnpm --filter @skelio/desktop dev` for Vite only, or install Rust.

## GitHub issues: Vertical Slice 1

You can create the eight MVP slice issues with the GitHub CLI (issue bodies live in the repo when present):

1. Install [`gh`](https://cli.github.com/), run `gh auth login`
2. `./scripts/create-vertical-slice-1-issues.sh`

Details: `.github/issues/vertical-slice-1/README.md` (if present) · Plan: `docs/14-vertical-slice-1-tasks.md`

## Pull requests

- Small, focused PRs with a clear description.
- **Runtime JSON** changes: update `schemas/`, `docs/04-data-model-schema.md`, add/update an **ADR**, and adjust tests/fixtures.
- No domain logic in `.vue` files — see `docs/06-design-patterns-and-conventions.md`.

## Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant).
