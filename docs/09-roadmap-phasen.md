# Roadmap & Phasen

## Phase 0 — Vorbereitung (abgeschlossen wenn Doku + ADR-Basis steht)

- Vision, MVP-Anforderungen, Architektur, Schema-Skizze, ADR-Template.
- Repo-Lizenz und Beitragsrichtlinie (siehe [12-opensource-governance.md](12-opensource-governance.md)).

## Phase 1 — Vertikaler Slice (MVP technisch)

**Ziel:** End-to-End „Rig → Export → Godot spielt ab“.

**Umsetzung in Arbeitspaketen:** [14-vertical-slice-1-tasks.md](14-vertical-slice-1-tasks.md)

Deliverables:

- Monorepo-Scaffold (Vue + Tauri + `packages/domain` …).
- Knochen-Hierarchie + Bind Pose im Editor.
- Timeline + Keys (Translation/Rotation minimal).
- JSON Export v1 + Validator.
- Godot-Minimalbeispiel + Dokumentation.

**Exit-Kriterium:** Fremde Person kann README folgen und Animation sehen.

## Phase 2 — Editor-Qualität

- Robusteres Undo/Redo, Keyboard-Workflows.
- Bessere Viewport-Gizmos, Fehlerbehandlung, kleine UX-Polish-Runde.
- JSON Schema Dateien + CI-Check auf Fixtures.

## Phase 3 — Mesh & Skinning

- Mesh-Attachments, Weights, Deformation (abhängig von Renderer-Entscheidung).
- Weight Paint UX (Grundlagen).

**Architektur:** [ADR-0009: Mesh-Skinning — Zielbild & Integrationspfad](adr/0009-mesh-skinning-roadmap.md)  
**GitHub:** vorgefertigte Issues — [.github/issues/phase-3-mesh/README.md](../.github/issues/phase-3-mesh/README.md), Skript `scripts/create-phase-3-mesh-issues.sh`.

## Phase 4 — Fortgeschrittene Animation

- IK, mehrere Clips, Easing-Kurven.
- Import aus anderen Formaten (optional, niedrige Priorität).

**Architektur:** [ADR-0010: Inverse Kinematics — Zielbild & Integrationspfad](adr/0010-inverse-kinematics-roadmap.md)  
**GitHub:** vorgefertigte Issues — [.github/issues/phase-4-ik/README.md](../.github/issues/phase-4-ik/README.md), Skript `scripts/create-phase-4-ik-issues.sh`.

## Phase 5 — Ökosystem

- Plugin-API (Host + Sandbox-Strategie).
- Auto-Rigging-Experimente (heuristisch, nicht „ML-Pflicht“).
- Optional: Web-Build / kollaborative Features nur nach eigener Machbarkeits-Analyse.

## Abhängigkeitsgraph (vereinfacht)

```
Phase 1 (Slice)
    → Phase 2 (Qualität)
          → Phase 3 (Mesh)
                → Phase 4 (IK / Clips)
                      → Phase 5 (Plugins / Ökosystem)
```

Phasen 3+ können teilweise **parallel** starten (z. B. IK-Prototyp an einfachen Bones laut [ADR-0010](adr/0010-inverse-kinematics-roadmap.md)), sollten aber **keinen** MVP-Blocker erzeugen.

**Mesh vs. IK:** Reihenfolge laut Graph unten; Details und Abgrenzungen in [ADR-0009](adr/0009-mesh-skinning-roadmap.md) und [ADR-0010](adr/0010-inverse-kinematics-roadmap.md).
