# Anforderungen & MVP

## Personas

1. **Indie-Entwickler:in (Godot)** — braucht schnelles Rigging, vorhersagbaren Export, wenig Überraschungen in der Laufzeit.
2. **Technical Artist** — erwartet nachvollziehbare Kurven, ggf. später Mesh-Weights; legt Wert auf reproduzierbare Builds und Tests.
3. **Mitwirkende:r (Open Source)** — braucht klare Module, ADRs und Einstieg ohne implizites Wissen.

## Funktionale Anforderungen

### MVP (Phase 1 — verbindlich)

| ID | Anforderung | Akzeptanzkriterium |
|----|-------------|-------------------|
| F-MVP-01 | Projekt anlegen, speichern, laden | Binär/JSON-Projektdatei mit Metadaten + Schema-Version; öffnen reproduzierbar |
| F-MVP-02 | Knochen-Hierarchie | Parent/Child, Umbenennen, Reihenfolge stabil im Export |
| F-MVP-03 | Transform-Keyframes | Mindestens Position (2D) und Rotation pro Knochen; Timeline mit Zeit in Sekunden oder Frames |
| F-MVP-04 | Playback | Abspielen im Editor mit definierter FPS und Loop-Option |
| F-MVP-05 | JSON-Runtime-Export | Export entspricht dokumentiertem Schema `04`; inkl. Version-Feld |
| F-MVP-06 | Godot-Story | Dokumentierter Import-Pfad + Referenz-Implementation in **GDScript** ([ADR-0005](adr/0005-godot-referenz-runtime-gdscript.md)) |
| F-MVP-07 | Undo / Redo | Mindestens für: Knochen hinzufügen/entfernen, Transform ändern, Key setzen/löschen |
| F-MVP-08 | Assets (minimal) | Einbindung eines **Sprite/Texture**-Slots pro Skin o. pro Knochen-Attachment (MVP: eine einfache Variante, dokumentiert) |

### Post-MVP (Phase 2+ — planbar, nicht verbindlich für ersten Release)

- IK (two-bone, pole vector)
- Mesh mit Weights und Deformation
- Animation Clips / mehrere Takes
- Easing-Kurven pro Kanal (Bezier)
- Skinning mehrerer Meshes, Slots, Draw Order
- Plugin-Schnittstelle (Host-API + Sandboxing-Strategie)
- Auto-Rigging-Heuristiken

### Explizit ausgeschlossen (frühe Phasen)

- Echtzeit-Multiuser-Bearbeitung
- Vollständige Film-Timeline mit Audio-Scoring
- Vektorzeichnung wie in Synfig
- Cloud-Sync als Kernprodukt

## Nicht-funktionale Anforderungen

| ID | Thema | Ziel |
|----|--------|------|
| NF-01 | Performance | Editor bleibt bei typischen Indie-Rigs (<200 Knochen, <5k Vertices später) flüssig; messbare Szenarien in Tests definieren |
| NF-02 | Determinismus Export | Gleiche Projektdatei + gleiche Version → gleicher Export-Output (Byte-identisch optional, strukturell identisch verpflichtend) |
| NF-03 | Abwärtskompatibilität | Schema-Version + Migrationshinweise in ADR bei Breaking Changes |
| NF-04 | Zugänglichkeit UI | Grundlegende Tastaturbedienung für Hauptabläufe (später WCAG-orientiert ausbauen) |
| NF-05 | Sicherheit (Desktop) | Tauri-Defaults: kein unkontrolliertes `eval`; File-Picker für Pfade |

## Glossar

| Begriff | Bedeutung in Skelio |
|---------|---------------------|
| **Armature** | Gesamtes Skelett inkl. Metadaten |
| **Bone** | Transform-Knoten in Hierarchie |
| **Clip** | Zeitlich begrenzte Animation (MVP: ggf. eine globale Timeline) |
| **Attachment** | Visuelle Bindung (Sprite) an Knochen/Slot |
| **Runtime-Export** | JSON für Game-Engine, ohne Editor-interne Hilfsdaten |

## Entscheidungen (MVP — ADRs)

Die für den Start relevanten Entscheidungen sind in **`docs/adr/`** festgehalten, u. a.:

- Godot-Referenz: **GDScript** — [ADR-0005](adr/0005-godot-referenz-runtime-gdscript.md)
- Projekt-Persistenz: **Ordnerprojekt** — [ADR-0004](adr/0004-projekt-persistenz-ordnerprojekt.md)
- Zeitbasis Runtime: **Sekunden** — [ADR-0006](adr/0006-runtime-zeitbasis-sekunden.md)
- Koordinaten / Rotation: **y-down**, **Radiant** — [ADR-0007](adr/0007-runtime-koordinaten-rotation.md)
- JSON-Keys: **camelCase** — [ADR-0008](adr/0008-runtime-json-camelcase.md)
