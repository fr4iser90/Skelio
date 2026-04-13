## Kontext

**Phase 4 — IK** ([ADR-0010](../../../docs/adr/0010-inverse-kinematics-roadmap.md)). FK bleibt kanonisch; IK ist Constraint-Schicht.

## Lieferobjekt

- **Datenmodell (Editor):** IK-Kette (Root → Effektor), Ziel (Effektor-Position), optional Pole/Ebenen-Parameter — konkrete Felder im PR festhalten und `docs/04-datenmodell-schema.md` aktualisieren.
- **UI-Minimal:** Kette anlegen, Ziel setzen, sichtbares Feedback im Viewport (Handles oder Gizmo-Entwurf).

## Akzeptanzkriterien

- [ ] IK-Setup ist speicherbar im Editor-Projekt (ohne Runtime-Pflicht im ersten Schritt, wenn ausdrücklich dokumentiert).
- [ ] Keine Duplikation von Domäneninvarianten in Vue ohne Domain-Funktionen.

## Doku

- `docs/adr/0010-inverse-kinematics-roadmap.md`
- `docs/07-ui-workflow.md`

## Abhängigkeiten

Braucht stabile Bone-Hierarchie und Timeline (Phase 1/2).
