# Changelog

All notable changes to this repository are documented here (format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).

## [Unreleased]

### Added

- Runtime JSON **1.1.0** with required **`skins`** (skinned meshes); schema `schemas/runtime-1.1.0.json`, exporter and tests with Ajv.
- **Folder project:** `project.skelio.json` + `assets/` — constants in domain, `@skelio/infrastructure` round-trip tests; Tauri read/write by path (input dialog).
- **CI:** GitHub Actions `pnpm typecheck` + `pnpm test`.
- GitHub issue templates + script for Vertical Slice 1: `.github/issues/vertical-slice-1/`, `scripts/create-vertical-slice-1-issues.sh`.
- **Vertical Slice 1** task breakdown: `docs/14-vertical-slice-1-tasks.md`.
- Monorepo foundation (`pnpm` workspaces): `@skelio/domain`, `@skelio/application`, `@skelio/infrastructure`, `@skelio/desktop`.
- Planning documentation under `docs/` and ADRs under `docs/adr/`.
- Runtime JSON schema `schemas/runtime-1.0.0.json` and schema changelog `schemas/CHANGELOG.md`.
- Minimal Godot example under `examples/godot-minimal/`.
- Cursor rules under `.cursor/rules/`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `AGENTS.md`.
