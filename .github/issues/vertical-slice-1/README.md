# GitHub-Issues: Vertical Slice 1

Die Dateien `body-01.md` … `body-08.md` sind **Issue-Bodies** (Markdown). Titel vergibt das Skript `scripts/create-vertical-slice-1-issues.sh`.

## Voraussetzungen

1. [GitHub CLI `gh`](https://cli.github.com/) installieren und `gh auth login` im Repo-Kontext ausführen.
2. Im Repository-Root:

```bash
./scripts/create-vertical-slice-1-issues.sh
```

Optional: `DRY_RUN=1 ./scripts/create-vertical-slice-1-issues.sh` — zeigt nur die Befehle.

## Labels / Milestone

Das Skript setzt das Label **`vertical-slice-1`**, falls es noch nicht existiert. Milestone kannst du in der GitHub-UI anlegen und Issues nachträglich zuordnen.

## Quelle

Auszug aus `docs/14-vertical-slice-1-tasks.md`.
