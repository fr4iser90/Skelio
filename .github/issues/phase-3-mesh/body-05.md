## Kontext

**Phase 3 — Mesh & Skinning.** [ADR-0005](../../../docs/adr/0005-godot-referenz-runtime-gdscript.md): Referenz-Runtime bleibt GDScript; Skinning muss nachvollziehbar abspielbar sein, sobald Runtime-Daten existieren.

## Lieferobjekt

- **Godot-Beispiel** (`examples/godot-minimal/` oder Unterordner): Mesh + Skeleton/Shader oder dokumentierter Pfad, der das erweiterte Runtime-JSON nutzt.
- **README**: Godot-Version, wie man den Export einbindet, Grenzen (was noch nicht unterstützt ist).

## Akzeptanzkriterien

- [ ] Mit Fixture oder Editor-Export lässt sich eine **sichtbare** deformierte Darstellung erzeugen.
- [ ] Keine zweite, undokumentierte JSON-Definition neben dem Schema.

## Doku

- `docs/08-godot-integration.md`
- `docs/adr/0005-godot-referenz-runtime-gdscript.md`

## Abhängigkeiten

Sinnvoll nach Schema + mindestens einem validen Mesh-Export.
