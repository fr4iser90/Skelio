# ADR-0003: Viewport-Rendering im MVP

## Status

angenommen

## Kontext

Der Viewport muss Knochenlinien, Gizmos und später Meshes darstellen. Die Wahl beeinflusst Performance, Team-Know-how und spätere Mesh-Features.

## Entscheidung

**MVP:** HTML **Canvas 2D** für Bones/Gizmos und einfache Sprite-Darstellung.

**Reevaluation-Trigger:** Sobald Mesh-Deformation oder große Szenen die Canvas-Grenzen spürbar machen → neues ADR „WebGL-Viewport“ oder Hybrid.

## Alternativen

- **WebGL / WebGPU:** mehr Power, höhere Komplexität.
- **SVG:** DOM-lastig bei vielen Objekten.

## Konsequenzen

### Positiv

- Schneller Start, ausreichend für Knochen-Visualisierung.

### Negativ / Kosten

- Möglicher späterer Port für fortgeschrittenes Skinning — Architektur über `Renderer2D`-Port abstrahieren (siehe Modulgrenzen-Doku).

## Referenzen

- [03-systemarchitektur.md](../03-systemarchitektur.md)
- [05-modulgrenzen-schnittstellen.md](../05-modulgrenzen-schnittstellen.md)
