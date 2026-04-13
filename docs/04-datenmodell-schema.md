# Datenmodell & Export-Schema

## Grundsätze

1. **Zwei Welten:** (A) **Editor-Projekt** — kann mehr Metadaten speichern (Auswahl, UI-Layout optional). (B) **Runtime-Export** — minimiert, stabil, versioniert.
2. **Schema-Version:** Feld `schemaVersion` (SemVer-String, aktuell Export **`"1.1.0"`**) an Wurzel jedes JSON.
3. **Breaking Change:** Major-Version erhöhen + ADR + Migrationsnotiz; wo möglich **Reader** für ältere Versionen bereitstellen.

## Domain-Modell (konzeptionell)

```
Project
├── meta (name, author, units, fps)
├── assets[]     (id, type, uri relative to project root)
├── armature
│   ├── bones[]  (id, parentId|null, name, bindPose: transform)
│   └── slots[]  (optional MVP: vereinfacht oder leer)
├── animations[]
│   └── tracks[]
│       ├── boneId
│       └── channels[]
│           ├── property   (enum: tx, ty, rot, sx, sy — MVP subset)
│           └── keys[]     (time, value, interpolation: hold | linear)
├── skinnedMeshes? (optional, Editor — siehe unten)
├── ikTwoBoneChains? (optional, Editor — 2-Segment-IK-Spike; kein Runtime-Export)
└── editorOnly?  (optional block, stripped on runtime export)
```

**IDs:** Stabile String-IDs (`ulid` oder `uuid`), keine Array-Indizes als Referenz in gespeicherten Daten.

## Koordinaten & Einheiten

Verbindlich für den Runtime-Export:

- **`meta.coordinateSystem`:** im MVP **`"y-down"`** — siehe [ADR-0007](adr/0007-runtime-koordinaten-rotation.md).
- **Rotation** in `bindPose` / Attachment-`transform`: **Radiant** — [ADR-0007](adr/0007-runtime-koordinaten-rotation.md).
- **Zeit** für Keys (`t`): **Sekunden**; `meta.fps` nur als Anzeige-/Sampling-Hinweis — [ADR-0006](adr/0006-runtime-zeitbasis-sekunden.md).
- **JSON-Property-Namen:** **camelCase** — [ADR-0008](adr/0008-runtime-json-camelcase.md).

## Runtime-Export JSON (MVP-Skizze)

> Die folgende Struktur ist die **vertragliche Zielvorgabe** für Phase 1. Feinjustierung erfolgt in Implementierung + ADR, nicht „still“.

```json
{
  "schemaVersion": "1.1.0",
  "meta": {
    "name": "example",
    "fps": 60,
    "duration": 2.5,
    "coordinateSystem": "y-down"
  },
  "assets": [
    { "id": "asset_tex_1", "type": "texture", "path": "textures/hero.png" }
  ],
  "armature": {
    "bones": [
      {
        "id": "bone_root",
        "parentId": null,
        "name": "root",
        "bindPose": { "x": 0, "y": 0, "rotation": 0, "sx": 1, "sy": 1 }
      }
    ],
    "attachments": [
      {
        "id": "att_1",
        "boneId": "bone_root",
        "assetId": "asset_tex_1",
        "transform": { "x": 0, "y": 0, "rotation": 0, "sx": 1, "sy": 1 }
      }
    ]
  },
  "animations": [
    {
      "id": "anim_walk",
      "name": "walk",
      "length": 2.5,
      "tracks": [
        {
          "boneId": "bone_root",
          "channels": [
            {
              "property": "tx",
              "interpolation": "linear",
              "keys": [
                { "t": 0, "v": 0 },
                { "t": 1, "v": 10 }
              ]
            }
          ]
        }
      ]
    }
  ],
  "skins": []
}
```

## Validierung vor Export

Pflichtprüfungen (nicht vollständig):

- Keine zyklischen Parent-Referenzen.
- Jede `boneId`/`assetId`-Referenz auflösbar.
- Key-Zeiten pro Track monoton steigend.
- `schemaVersion` gesetzt und vom Exporter unterstützt.

## Projektdatei (Editor)

Empfehlung (per ADR festzurren):

- **Option A:** Ordner-Projekt: `project.skelio.json` + `assets/` (gut für Git, einfach).
- **Option B:** Einzel-Archiv (ZIP) mit Manifest — besser für „eine Datei teilen“.

MVP soll **Option A** bevorzugen, sofern nicht anders entschieden.

**Umsetzung:** Manifest-Name `project.skelio.json`, Unterordner `assets/` — Konstanten in `@skelio/domain`, I/O-Hilfen in `@skelio/infrastructure` (`writeProjectToDirectory` / `readProjectFromDirectory`). Die Desktop-App (Tauri) schreibt/liest über eingebaute Commands; Ordnerwahl aktuell per **Pfad-Eingabe** (siehe `apps/skelio-desktop/README.md`).

## Editor: Skinning (Umsetzung begonnen)

Das **Editor-Projekt** kann optional **`skinnedMeshes`** tragen: Dreiecks-Meshes in bind space mit Einflüssen pro Vertex (`SkinInfluence`). Der Viewport deformat mit **linear blend skinning** (2D). Der **Runtime-Export** `schemaVersion: "1.1.0"` mappt diese Daten nach **`skins`** (siehe `schemas/runtime-1.1.0.json`, [ADR-0002](adr/0002-runtime-json-schema-versioning.md), [ADR-0009](adr/0009-mesh-skinning-roadmap.md)).

## Editor: IK — Zwei-Knochen-Ketten (Spike)

Optional **`ikTwoBoneChains`**: jeweils eine Kette **root → mid → tip** (strikte Bone-Parent-Kette). Lösung im Editor: **FABRIK** in der Ebene auf Welt-Positionen der Gelenke; **FK bleibt kanonisch** für Keyframes und Skinning im Spike ([ADR-0010](adr/0010-inverse-kinematics-roadmap.md)). Der **Runtime-Export** enthält diese Felder **nicht** (Bake/Runtime-Vertrag folgt später).

Konzeptionelle Felder (camelCase, wie `@skelio/domain`):

| Feld | Bedeutung |
|------|-----------|
| `id` | Stabile Ketten-ID |
| `name` | Anzeigename |
| `enabled` | IK ein/aus |
| `rootBoneId`, `midBoneId`, `tipBoneId` | Bone-IDs; `mid.parentId === root`, `tip.parentId === mid` |
| `targetX`, `targetY` | IK-Ziel in Weltkoordinaten (2D) |

## Post-MVP: Mesh-Skinning & IK (Richtung)

Für **Mesh-Skinning** und **Inverse Kinematics** gelten die Architektur-ADRs; Runtime-Export-Erweiterungen folgen **Minor-Versionierung** ([ADR-0002](adr/0002-runtime-json-schema-versioning.md)):

- [ADR-0009 — Mesh-Skinning: Zielbild & Integrationspfad](adr/0009-mesh-skinning-roadmap.md)
- [ADR-0010 — Inverse Kinematics: Zielbild & Integrationspfad](adr/0010-inverse-kinematics-roadmap.md)

Konkrete **Runtime**-JSON-Felder für IK werden ergänzt, sobald Bake/Runtime-Vertrag festliegt; der Editor-Spike nutzt nur die oben beschriebenen Projekt-Felder.

## Migration

- Jede Schema-Änderung: `docs/adr/` + Abschnitt „Migration von X zu Y“ in diesem Dokument oder verlinktem `schemas/CHANGELOG.md` (wird bei Implementierung angelegt).

## JSON Schema

Aktuelles Schema: **`schemas/runtime-1.1.0.json`** (Changelog: `schemas/CHANGELOG.md`). Ältere Version: `runtime-1.0.0.json` (ohne `skins`). Exporte in Tests gegen 1.1.0 validieren.
