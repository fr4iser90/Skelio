## Kontext

**Phase 3 — Mesh & Skinning.** [ADR-0009](../../../docs/adr/0009-mesh-skinning-roadmap.md) sieht einen **Reevaluation-Trigger** für den Viewport, sobald deformierte Meshes Canvas-2D sprengen ([ADR-0003](../../../docs/adr/0003-viewport-rendering-mvp.md)).

## Lieferobjekt

- **Spike oder MVP:** deformierte Mesh-Darstellung im Editor (WebGL/WebGPU/Hybrid — Entscheidung dokumentieren, kurzes ADR oder Anhang zu ADR-0003).
- Performance-Ziel grob benennen (z. B. „X Vertices @ 60 FPS im Viewport“ als Richtwert, nicht als Garantie).

## Akzeptanzkriterien

- [ ] Entscheidung und Begründung stehen in `docs/adr/` oder verlinktem Abschnitt.
- [ ] Minimal sichtbare Deformation im Viewport ODER bewusstes „noch Placeholder“ mit nächstem Schritt-Issue.

## Doku

- `docs/adr/0003-viewport-rendering-mvp.md`
- `docs/adr/0009-mesh-skinning-roadmap.md`

## Abhängigkeiten

Überschneidet sich mit Schema + Gewichten; Reihenfolge mit Team abstimmen.
