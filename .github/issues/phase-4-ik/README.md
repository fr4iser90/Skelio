# GitHub-Issues: Phase 4 — Inverse Kinematics

Vorgefertigte Bodies für Arbeitspakete rund um [ADR-0010](../../../docs/adr/0010-inverse-kinematics-roadmap.md).  
**Voraussetzung:** Solide FK-Timeline + Export; Mesh (Phase 3) ist für IK **nicht** zwingend, aber Roadmap-Reihenfolge beachten.

## Milestone (empfohlen)

- **Titel:** `Phase 4 — Inverse Kinematics`
- **Beschreibung:** IK-Schicht über FK, Export-Strategie; siehe ADR-0010 und `docs/09-roadmap-phasen.md`.

Issues nach dem Lauf dem Milestone zuordnen.

## Issues erzeugen

```bash
./scripts/create-phase-4-ik-issues.sh
```

Trockenlauf:

```bash
DRY_RUN=1 ./scripts/create-phase-4-ik-issues.sh
```

## Label

Das Skript legt **`phase-4-ik`** an (falls nicht vorhanden).
