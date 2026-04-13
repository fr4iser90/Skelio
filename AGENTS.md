# Agenten / KI — Kurzbriefing

1. Lies **`docs/README.md`** (vollständiger Plan) und bei Architekturentscheidungen **`docs/adr/`**.
2. **Runtime-Export** ist vertraglich: `docs/04-datenmodell-schema.md` + `schemas/runtime-1.1.0.json` (ältere: `runtime-1.0.0.json`). Änderungen nur mit ADR und Fixture-Updates.
3. **Schichten:** Keine Vue- oder Tauri-Imports in `packages/domain`. UI spricht über Commands / Application-Layer (`docs/05-modulgrenzen-schnittstellen.md`, `docs/06-designpatterns-konventionen.md`).
4. Umsetzungsphasen: **`docs/14-vertical-slice-1-tasks.md`** (konkrete Tasks mit Akzeptanzkriterien).
5. Befehle im Repo-Root:
   - `pnpm install`
   - `pnpm test` — Paket-Tests
   - `pnpm typecheck`
   - `pnpm dev` — Desktop-App (Rust/Tauri erforderlich)

Details zum Ableiten von Cursor-Regeln: **`docs/13-ki-gestuetzte-entwicklung.md`**.
