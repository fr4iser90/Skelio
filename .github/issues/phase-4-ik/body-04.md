## Kontext

**Phase 4 — IK.** Referenz-Runtime Godot ([ADR-0005](../../../docs/adr/0005-godot-referenz-runtime-gdscript.md)): Entweder **gebakte FKs** abspielen oder Runtime-IK aus dem Export nutzen — je nach vorheriger Export-Entscheidung.

## Lieferobjekt

- **Doku + Beispiel:** `docs/08-godot-integration.md` und `examples/godot-minimal/` (oder Nachfolger) beschreiben den unterstützten Pfad.
- Wenn nur Bake: klar schreiben, dass Godot **keine** Skelio-IK-Laufzeit braucht.
- Wenn Runtime-IK: minimaler **GDScript**-Pfad oder bewusst „out of scope“ mit Issue-Verweis.

## Akzeptanzkriterien

- [ ] Neue Nutzer können nach README vorgehen ohne parallele JSON-Spezifikation.
- [ ] Verweis auf ADR-0010 und ggf. Schema-Minor.

## Doku

- `docs/08-godot-integration.md`
- `docs/adr/0010-inverse-kinematics-roadmap.md`

## Abhängigkeiten

Nach Export-Strategie-Issue sinnvoll.
