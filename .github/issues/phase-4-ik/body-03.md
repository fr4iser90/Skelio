## Kontext

**Phase 4 — IK.** [ADR-0010](../../../docs/adr/0010-inverse-kinematics-roadmap.md): **Variante A** Runtime-IK-Metadaten vs **Variante B** Bake auf FK-Keys.

## Lieferobjekt

- **Export-Strategie festlegen** und implementieren (mindestens eine Variante):
  - **Bake:** IK → Keys für betroffene Kanäle, Runtime-JSON unverändert zum heutigen FK-Vertrag.
  - **oder** optionale Runtime-Struktur für Constraints (Minor-Schema) + Validator.
- **Fehlerliste** bei Export-Problemen (Pfade wie im Rest des Editors).

## Akzeptanzkriterien

- [ ] Verhalten ist in `docs/04-datenmodell-schema.md` und/oder `schemas/CHANGELOG.md` beschrieben.
- [ ] Kein stiller Datenverlust (IK aktiv, Export ohne Keys/Metadaten ohne Warnung).

## Doku

- `docs/adr/0002-runtime-json-schema-versioning.md`
- `docs/adr/0010-inverse-kinematics-roadmap.md`

## Abhängigkeiten

Braucht funktionierenden Solver und klares Editor-Modell.
