## Kontext

Teil von **Phase 3 — Mesh & Skinning** ([ADR-0009](../../../docs/adr/0009-mesh-skinning-roadmap.md)). Runtime-JSON muss Skinning-Daten transportieren, ohne Major-Break ohne Anlass ([ADR-0002](../../../docs/adr/0002-runtime-json-schema-versioning.md)).

## Lieferobjekt

- Erweiterungsvorschlag für **Runtime-Schema** (Minor): Mesh-Referenz, Bind-Pose-Geometrie, Influences (z. B. max. 4 Gewichte pro Vertex), konsistent mit `coordinateSystem: y-down`.
- Neues oder erweitertes JSON-Schema unter `schemas/`, **CHANGELOG**-Eintrag.
- **CI/Test:** Fixture(s) validieren; Export aus dem Editor (wenn vorhanden) oder handgeschriebenes Minimal-JSON.

## Akzeptanzkriterien

- [ ] Schema-Änderungen dokumentiert in `docs/04-datenmodell-schema.md` (oder verlinktes Detail).
- [ ] `pnpm`/CI validiert Runtime-Fixtures gegen das Schema.
- [ ] Keine stillen Breaking Changes ohne Major-Bump (siehe ADR-0002).

## Doku

- `docs/adr/0009-mesh-skinning-roadmap.md`
- `schemas/CHANGELOG.md` (anlegen falls noch nicht vorhanden)

## Abhängigkeiten

Blockiert sinnvolle Arbeit an Editor-Viewport und Godot-Mesh-Pfad mit „vertraglichem“ JSON.
