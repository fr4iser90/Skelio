# Systemarchitektur

## Zielbild: Schichten

```
┌─────────────────────────────────────────────┐
│  Presentation (Vue 3 + TypeScript)          │
│  Views, Panels, Canvas/WebGL/2D Renderer-UI   │
└────────────────────┬────────────────────────┘
                     │ Commands / Queries (thin)
┌────────────────────▼────────────────────────┐
│  Application / Use Cases                    │
│  Orchestrierung: „Add Bone“, „Set Key“, …   │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  Domain (framework-frei)                    │
│  Armature, Bone, Clip, Keyframe, Curves     │
│  Regeln, Validierung, reine Berechnungen     │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│  Infrastructure                            │
│  Datei-I/O, Tauri FS-API, Serializer,      │
│  Export-Builder, Logging                     │
└─────────────────────────────────────────────┘
```

**Regel:** Vue-Komponenten enthalten **keine** Domäneninvarianten (z. B. „Parent darf keinen Zyklus bilden“); sie rufen **Anwendungsfälle** auf, die das Domain-Modell nutzen.

## Laufzeitumgebungen

| Umgebung | Rolle |
|----------|--------|
| **Tauri (Desktop)** | Primäres Ziel MVP: Dateizugriff, Menüs, Autoupdate optional später |
| **Browser (später)** | Optional: gleicher Domain-Core, andere I/O-Adapter; nicht MVP-Blocker |

## Editor-Subsysteme

1. **Szene / Viewport** — Darstellung des Rigs, Gizmos, Auswahl.
2. **Hierarchy Panel** — Baum der Knochen, DnD (wenn MVP-Scope reicht).
3. **Timeline** — Keys scrubben, Current Time.
4. **Inspector** — Eigenschaften des selektierten Objekts.
5. **Asset-Browser (light)** — Texturen referenzieren.

Jedes Subsystem spricht mit dem **gleichen** Application-State bzw. dem **Command-Bus** (siehe Designpatterns-Dokument).

## Persistenz

- **Projektdatei:** Enthält vollständigen Editor-Zustand (oder Referenzen auf externe Assets mit relativen Pfaden).
- **Runtime-Export:** Reduziertes, engine-freundliches JSON nach [04-datenmodell-schema.md](04-datenmodell-schema.md).

## Nebenläufigkeit

MVP: **single-threaded** Domain; schwere Aufgaben (später: Mesh-Triangulation, große Imports) optional in **Web Worker** / Tauri Sidecar — erst planen, wenn Bedarf messbar ist.

## Technologie-Leitplanken (vorgeschlagen)

| Bereich | Vorschlag | Begründung |
|---------|-----------|------------|
| UI | Vue 3, Composition API | Nutzerwunsch; klare Grenzen zu Domain möglich |
| Shell | Tauri 2.x | Native FS, kleiner Footprint |
| Sprache | TypeScript strict | Gemeinsame Typen für Serializer/Domain |
| 2D-Viewport | Canvas 2D **oder** WebGL (entscheiden per ADR) | Canvas reicht für MVP-Gizmos; WebGL für Mesh später |

## Observability

- Strukturierte Logs (Level `info`/`warn`/`error`) in Infrastructure.
- Keine stillen Fehler beim Export: **validieren**, dann Export oder **explizite** Fehlerliste für die UI.

## Abhängigkeiten zwischen Modulen

Siehe [05-modulgrenzen-schnittstellen.md](05-modulgrenzen-schnittstellen.md).
