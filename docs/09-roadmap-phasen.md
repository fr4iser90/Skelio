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

## Phase 4 — Fortgeschrittene Animation

- IK, mehrere Clips, Easing-Kurven.
- Import aus anderen Formaten (optional, niedrige Priorität).

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

Phasen 3+ können teilweise **parallel** starten (z. B. IK-Prototyp), sollten aber **keinen** MVP-Blocker erzeugen.
