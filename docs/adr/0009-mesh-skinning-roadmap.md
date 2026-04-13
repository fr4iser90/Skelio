# ADR-0009: Mesh-Skinning — Zielbild & Integrationspfad

## Status

angenommen

## Kontext

Skelio soll **Mesh-Skinning** unterstützen: Geometrie, die sich mit einer Knochen-Hierarchie mitverformt (Vertex-Gewichte pro Knochen). Das ist deutlich komplexer als reine **Bone-Forward-Kinematics** + Sprite-Attachments und betrifft Datenmodell, Editor-UX (Weight Paint), Viewport-Rendering und Runtime-Export.

Ohne feste Leitplanken drohen inkompatible Teillösungen (z. B. nur Editor-interne Meshes ohne exportierbaren Vertrag).

## Entscheidung

1. **Ziel**  
   Skinning ist **explizites Produktziel** (Roadmap Phase 3, siehe [09-roadmap-phasen.md](../09-roadmap-phasen.md)), **kein** MVP-Blocker für Phase 1.

2. **Voraussetzungen (müssen vor oder parallel stabil sein)**  
   - Stabile **Armatur + FK-Animation** und Runtime-Export nach [ADR-0002](0002-runtime-json-schema-versioning.md).  
   - **Projekt-/Asset-Pipeline** mit relativen Pfaden ([ADR-0004](0004-projekt-persistenz-ordnerprojekt.md)), damit Mesh- und Texturdaten reproduzierbar sind.  
   - **JSON-Schema & CI-Validierung** für Runtime-Export, damit Schema-Erweiterungen kontrolliert einziehen.

3. **Runtime-Vertrag**  
   - Skinning-relevante Felder kommen als **rückwärtskompatible Erweiterung** (Minor-Version von `schemaVersion` bzw. neues Runtime-Minor-Schema), nicht als stiller Bruch.  
   - Konkrete Feldnamen (z. B. Mesh-Asset-Referenz, Bind-Pose-Vertices, `boneIndex`/`weight`-Paare, max. Influences) werden in **Implementierungs-PRs** in [04-datenmodell-schema.md](../04-datenmodell-schema.md) und `schemas/` nachgezogen — dieser ADR fixiert nur die **Architektur-Richtung**.

4. **Viewport / Rendering**  
   - MVP bleibt bei Canvas-2D-Gizmos ([ADR-0003](0003-viewport-rendering-mvp.md)).  
   - Sobald deformierte Meshes die Canvas-Grenzen spürbar treffen, ist ein **Reevaluation-Trigger** für WebGL/WebGPU oder Hybrid aktiv (ADR-0003 „Reevaluation-Trigger“).

5. **Referenz-Runtime (Godot)**  
   - Deformation im **Godot-Minimalbeispiel** folgt, wenn Runtime-Schema und Editor-Export Mesh-Daten liefern; Umsetzung in GDScript/Shader gemäß [ADR-0005](0005-godot-referenz-runtime-gdscript.md).

6. **Abgrenzung**  
   - **Physik-Cloth**, **Soft-Body** und **automatisches Weighting** (Heat-Map) sind **nicht** Teil dieser ADR; können später eigene ADRs oder Issues erhalten.

## Konsequenzen

### Positiv

- Klare Einordnung: Skinning ist geplant, aber nach **FK + Assets + Schema-Disziplin**.  
- Export-Versionierung bleibt konsistent mit [ADR-0002](0002-runtime-json-schema-versioning.md).

### Negativ / Kosten

- Hoher Implementierungsaufwand (Editor-Tooling, Validierung, Performance).  
- Ohne abgeschlossene Phase 1/2 bleibt Skinning **Forschungs- oder Parallelbranch-Risiko** — parallel starten nur mit klarer Issue-Grenze.

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)  
- [11-risiken-nichtziele.md](../11-risiken-nichtziele.md)  
- [09-roadmap-phasen.md](../09-roadmap-phasen.md)
