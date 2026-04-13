# Risiken & Nicht-Ziele

## Hauptrisiken

| Risiko | Auswirkung | Mitigation |
|--------|------------|------------|
| Scope Creep (Mesh, IK, Collab „schnell mal“) | MVP kommt nie | Verbindliche MVP-Liste in [02-anforderungen-mvp.md](02-anforderungen-mvp.md); Feature-Flags |
| Export-Format drift ohne Versionierung | Godot-User brechen | `schemaVersion`, ADRs, JSON Schema in CI |
| Domänenlogik in Vue | Untestbar, Bugs | Reviews + Architektur-Checks |
| Viewport-Technik zu spät entschieden | Rewrite | ADR früh: Canvas vs WebGL |
| Ein-Personen-Busfaktor | Stillstand | Doku, ADRs, gute Issues, CONTRIBUTING |

## Technische Risiken

- **Inverse Kinematics** später: mathematisch und UX-intensiv — erst nach stabilem Forward-Kinematics-Pfad.
- **Mesh-Deformation:** Performance und Tooling (Weight Paint) sind groß; klar von MVP trennen.

## Nicht-Ziele (explizit)

- Kein proprietäres Runtime-Format als **einzige** Option (JSON bleibt Referenz).
- Kein eingebetteter **Git-Client** als Kernfeature.
- Kein **Cloud-Zwang** für Nutzung der Software.
- Kein vollständiger **Spine-Importer** im MVP (optional später, rechtliche/technische Klärung nötig).

## Rechtliches / Marken

- Keine Nutzung fremder Markenlogos; **eigene** Icons/Branding.
- Bei optionalen Importen aus kommerziellen Formaten: **juristische** Klärung vor Implementierung.
