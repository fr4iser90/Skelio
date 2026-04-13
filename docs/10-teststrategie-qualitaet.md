# Teststrategie & Qualität

## Testpyramide

| Ebene | Inhalt | Werkzeuge (Vorschlag) |
|-------|--------|------------------------|
| Unit | Domain: Validierung, Transform-Hierarchie, Key-Interpolation | Vitest / Jest |
| Integration | Command + Undo-Ketten, Serializer Roundtrip | Vitest |
| E2E (später) | Kritische UI-Pfade | Playwright (optional nach MVP) |
| Export-Golden | Fixture-Projekt → JSON Snapshot | Vitest + `toMatchFileSnapshot` oder string compare |

## Pflicht-Fixtures

Unter `packages/domain/test/fixtures/` (bei Implementierung):

- `minimal_armature.json` — ein Bone.
- `two_bone_chain.json` — Parent/Child.
- `simple_animation.json` — zwei Keys auf Translation.

**Regel:** Änderung am Export-Format → bewusste Snapshot-Updates im PR mit Erklärung.

## Continuous Integration

- `lint` (ESLint + Prettier)
- `typecheck` (`tsc --noEmit`)
- `test` (alle Pakete)
- Optional: `godot --headless` nur wenn stabil verfügbar — sonst manuelle Checkliste bis Phase 2.

## Qualitätsmetriken (leichtgewichtig)

- Testabdeckung **Domain > 80 %** langfristig sinnvoll; MVP: **kritische Pfade** abdecken statt Zahl optimieren.
- Keine **TODO** ohne Ticket-Link in mergefähigem Code (Konvention).

## Performance-Checks

- Einfacher Benchmark: 200 Knochen, Keys scrubben — Regression nur wenn messbar (später CI-Budget).

## Code Review-Checkliste (kurz)

- Betrifft Export-Schema? → ADR + Doku + Fixture.
- Neue Abhängigkeit? → Begründung, Größe, Lizenz.
- UI-only? → Keine Domain-Logik in `.vue`.
