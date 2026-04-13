# Open Source & Governance

## Lizenz

Das Repository steht unter **GNU GPLv3** (`LICENSE`). Neue Dateien und Dependencies müssen zur **GPLv3-Kompatibilität** passen (bei Unsicherheit vor Merge klären). Wer später **maximale** Engine-Einbindung ohne Copyleft-Fragen will, braucht eine **bewusste** Relizenzierungs- oder Split-Repo-Strategie (eigenes ADR, nicht MVP).

## Beiträge

Im Repository vorhanden:

- `CONTRIBUTING.md` — Einstieg, Befehle, PR-Erwartungen.
- `CODE_OF_CONDUCT.md` — Contributor Covenant.
- `SECURITY.md` — private Meldewege für sensible Themen.

## Entscheidungsfindung

- **Architektur:** ADR in `docs/adr/`.
- **Produkt/MVP:** Änderungen an [02-anforderungen-mvp.md](02-anforderungen-mvp.md) bewusst und im PR beschrieben.

## Kommunikation

- **Changelog:** `CHANGELOG.md` (Keep a Changelog Format) ab erstem Release.
- **Security:** `SECURITY.md` mit Kontaktadresse für sensible Meldungen (vor öffentlicher Beta).

## Branding

- Name **Skelio** für das Projekt reservieren; Logo/Wordmark später einheitlich.

## Dependencies

- Nur Dependencies mit **klarer OSS-Lizenz**; regelmäßig `pnpm audit` / Dependabot (wenn GitHub).
