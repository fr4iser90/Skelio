# ADR-0005: Godot-Referenz-Runtime in GDScript

## Status

angenommen

## Kontext

Für MVP muss klar sein, in welcher Sprache die **offizielle** Godot-Referenz-Implementation (Beispielprojekt / Addon) gepflegt wird. **GDScript** und **C#** sind beide üblich; nur eine Variante soll die Doku, CI-Beispiele und Issue-Priorität tragen.

## Entscheidung

1. Die **Referenz-Runtime** für Godot wird in **GDScript** implementiert und dokumentiert.
2. **C#** ist im MVP **kein** Pflicht-Pfad: keine parallele „offizielle“ Pflege in Phase 1. Eine spätere Community- oder Core-Ergänzung ist möglich, dann neues ADR oder Erweiterung dieser Datei.
3. Godot-Version für Beispiele: **aktuell stabile 4.x** zum Zeitpunkt des Scaffoldings (in `examples/godot-minimal/README.md` bei Implementierung mit **exakter** Minor-Version pinnen).

## Konsequenzen

### Positiv

- Kein .NET-Toolchain-Zwang für Mitwirkende und CI.
- Deckt sich mit der Mehrheit der Godot-4-Tutorials und der GPL-OSS-Praxis im Ökosystem.
- Eine Codebasis weniger für den vertikalen Slice.

### Negativ / Kosten

- Teams, die ausschließlich C# nutzen, müssen portieren oder wrappen (Doku kann einen kurzen Hinweis geben: JSON-Schema bleibt die Schnittstelle).

## Referenzen

- [02-anforderungen-mvp.md](../02-anforderungen-mvp.md) (F-MVP-06)
- [08-godot-integration.md](../08-godot-integration.md)
