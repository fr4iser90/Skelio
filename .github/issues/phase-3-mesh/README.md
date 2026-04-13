# GitHub-Issues: Phase 3 — Mesh & Skinning

Vorgefertigte Bodies für Arbeitspakete rund um [ADR-0009](../../../docs/adr/0009-mesh-skinning-roadmap.md).  
**Voraussetzung:** Phase 1/2 stabil (FK, Export, Ordnerprojekt idealerweise vorhanden).

## Milestone (empfohlen)

In GitHub unter **Issues → Milestones** anlegen, z. B.:

- **Titel:** `Phase 3 — Mesh & Skinning`
- **Beschreibung:** Mesh-Assets, Weights, Deformation; siehe ADR-0009 und `docs/09-roadmap-phasen.md`.

Issues nach dem Lauf **dem Milestone zuordnen** (Skript setzt keinen Milestone automatisch).

## Issues erzeugen

1. [GitHub CLI `gh`](https://cli.github.com/) installieren und `gh auth login`.
2. Im Repository-Root:

```bash
./scripts/create-phase-3-mesh-issues.sh
```

Trockenlauf:

```bash
DRY_RUN=1 ./scripts/create-phase-3-mesh-issues.sh
```

## Label

Das Skript legt **`phase-3-mesh`** an (falls nicht vorhanden).
