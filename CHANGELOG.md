# Changelog

Alle wesentlichen Änderungen an diesem Repository werden hier dokumentiert (Format inspiriert von [Keep a Changelog](https://keepachangelog.com/de/1.1.0/)).

## [Unreleased]

### Added

- Runtime-JSON **1.1.0** mit Pflichtfeld **`skins`** (skinned Meshes); Schema `schemas/runtime-1.1.0.json`, Exporter und Tests mit Ajv.
- **Ordnerprojekt:** `project.skelio.json` + `assets/` — Konstanten in Domain, `@skelio/infrastructure` Roundtrip-Tests; Tauri: Lesen/Schreiben per Pfad (Eingabedialog).
- **CI:** GitHub Actions `pnpm typecheck` + `pnpm test`.
- GitHub-Issue-Vorlagen + Skript für Vertical Slice 1: `.github/issues/vertical-slice-1/`, `scripts/create-vertical-slice-1-issues.sh`.
- Aufgabenzerlegung **Vertical Slice 1**: `docs/14-vertical-slice-1-tasks.md`.
- Monorepo-Grundlage (`pnpm` Workspaces): `@skelio/domain`, `@skelio/application`, `@skelio/infrastructure`, `@skelio/desktop`.
- Vollständige Planungsdokumentation unter `docs/` und ADRs unter `docs/adr/`.
- Runtime-JSON-Schema `schemas/runtime-1.0.0.json` und Schema-Changelog `schemas/CHANGELOG.md`.
- Beispiel-Godot-Projektgerüst unter `examples/godot-minimal/`.
- Cursor-Regeln unter `.cursor/rules/`.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `AGENTS.md`.
