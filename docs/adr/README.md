# Architecture Decision Records (ADRs)

ADRs dokumentieren **eine** relevante Architekturentscheidung mit Kontext, Entscheidung und Konsequenzen.

## Format

- Dateiname: `NNNN-kurzbeschreibung-in-kebab-case.md`
- Nummerierung: fortlaufend, **nie** umsortieren (Lücken ok).

## Vorlage

Siehe [0000-template.md](0000-template.md).

## Index

| ADR | Titel | Status |
|-----|--------|--------|
| [0001](0001-desktop-vue-tauri.md) | Desktop-Stack: Vue + Tauri | angenommen |
| [0002](0002-runtime-json-schema-versioning.md) | Runtime-JSON & Versionierung | angenommen |
| [0003](0003-viewport-rendering-mvp.md) | Viewport-Rendering MVP (Canvas 2D) | angenommen |
| [0004](0004-projekt-persistenz-ordnerprojekt.md) | Projekt-Persistenz: Ordnerprojekt | angenommen |
| [0005](0005-godot-referenz-runtime-gdscript.md) | Godot-Referenz-Runtime: GDScript | angenommen |
| [0006](0006-runtime-zeitbasis-sekunden.md) | Runtime-Zeitbasis: Sekunden | angenommen |
| [0007](0007-runtime-koordinaten-rotation.md) | Runtime: y-down + Rotation Radiant | angenommen |
| [0008](0008-runtime-json-camelcase.md) | Runtime-JSON: camelCase | angenommen |
| [0009](0009-mesh-skinning-roadmap.md) | Mesh-Skinning: Zielbild & Integrationspfad | angenommen |
| [0010](0010-inverse-kinematics-roadmap.md) | Inverse Kinematics (IK): Zielbild & Integrationspfad | angenommen |

Neue ADRs: Kopie von `0000-template.md`, Nummer +1, PR verlinken.
