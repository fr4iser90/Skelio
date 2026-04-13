# Vision & Strategie

## Produktvision

**Skelio** ist ein quelloffener 2D-Editor für **skelettale Animation** mit Fokus auf **Game-Pipelines**: klare Datenstrukturen, stabiler **JSON-Runtime-Export** und **Godot** als primäres Ziel-Ökosystem. Ziel ist nicht, jedes klassische 2D-Film-Feature abzubilden, sondern einen **modernen, erweiterbaren** Workflow zu liefern, der dort Lücken schließt, die Nutzer bei generischen Animations-Tools oder überkomplexen Suiten beschreiben.

## Leitprinzipien

1. **Runtime first:** Alles, was im Editor existiert, muss sich im Export wiederfinden lassen oder bewusst als „Editor-only“ markiert sein.
2. **Explizite Versionierung:** Jede gespeicherte Datei und jeder Export trägt eine **Schema-Version**; Breaking Changes werden migrierbar dokumentiert.
3. **Kern von UI trennen:** Domänenlogik (Knochen, Keys, Kurven) ist **framework-agnostisch** testbar; Vue ist Darstellung und Orchestrierung.
4. **Kleine, lieferbare Schritte:** Features werden in Phasen ausgeliefert, die jeweils **End-to-End nutzbar** sind (siehe Roadmap).
5. **Erweiterbarkeit vorbereiten:** Plugin-API ist **nicht** MVP-Pflicht, aber Architektur und Schnittstellen sollen später **ohne Totalumbau** erweiterbar sein.

## Positionierung (Markt / Alternativen)

| Richtung | Skelio-Fokus |
|----------|----------------|
| Spine-ähnlich | Skeletal, Timeline, Mesh später — **kein** Ziel, Feature-parität zu kommerziellen Tools zu versprechen. |
| DragonBones / ältere OSS | Modernere UX, klare Godot-Story, aktive Schema-Dokumentation. |
| Synfig / OpenToonz | Nicht primär Film-Cartoon-Pipeline; **Game-Export** steht im Zentrum. |
| Blender | Kein Ersatz für „alles in einem“; Skelio soll **fokussiert** und schnell erlernbar bleiben. |

## Erfolgskriterien (MVP)

- Ein Nutzer kann ein **einfaches Rig** (Hierarchie, Keyframes auf Translation/Rotation) erstellen, speichern und als **versioniertes JSON** exportieren.
- Ein **Godot-Projekt** kann diese Daten **laden und abspielen** (Referenz-Importer oder Dokumentation + Minimal-Skript), ohne proprietäre Zwischenformate.
- **Undo/Redo** für die wichtigsten Editor-Aktionen ist vorhanden.
- Projektdatei (`.skelio` o. ä.) und Export sind **dokumentiert** und im Repo **beispielhaft** abgedeckt.

## Strategische Nicht-Vision (kurz)

Skelio soll in v1 **kein** Echtzeit-Kollaborations-Produkt, kein Renderer für cinematische Compositing-Pipelines und kein Ersatz für professionelle Storyboard-Software sein. Details: [11-risiken-nichtziele.md](11-risiken-nichtziele.md).
