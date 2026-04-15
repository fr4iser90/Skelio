# ADR 0011: Editor Bone 3D (Z, Tilt, Spin, Depth)

## Status

Accepted (Editor-only; Runtime JSON unverändert bis separates Schema-Update).

## Kontext

Skelio hatte nur **2D**-`bindPose` und Kanäle `tx` / `ty` / `rot`.

## Entscheidung

1. **Editor-Datenmodell** (`packages/domain`): optionales `bindBone3d` pro `Bone`:
   - `z`, `depthOffset` (werden für die lokale Z-Translation **addiert**; ),
   - `tilt`, `spin` (Bogenmaß).
2. **Neue Animationskanäle**: `tz`, `tilt`, `spin` (Interpolation wie bestehende Skalare).
3. **Lokale Transformations-Reihenfolge** (Spaltenvektoren, `M * v`):
   `T(x,y,z) * Rz(rotation) * Rx(tilt) * Ry(spin) * S(sx,sy,1)`  
   wobei `rotation` aus dem bestehenden `bindPose.rotation` kommt (Plan-/Screen-Drehung), `tilt`/`spin` zusätzliche Achsen.
4. **World-Matrix**: Eltern-Kette mit **4×4**; für bestehende **2D-Skinning**-Pfade wird eine **XY-Projektion** der oberen 2×2 + Translation (`mat4ToMat2dProjection`) verwendet — bekannte Näherung, solange Meshes flach in der Ebene bleiben.
5. **Runtime-Export** (`editorProjectToRuntime`): unverändertes Schema **1.1.0** — Kanäle `tz` / `tilt` / `spin` und Felder `bindBone3d` werden beim Export **nicht** mit ausgegeben (oder nur 2D-relevante Daten). Vollständiger 3D-Export = eigenes ADR + Schema-Version.

## Konsequenzen

- IK bleibt **2D** (bestehend); bei starkem Tilt/Spin kann die IK-Vorschau von der FK-3D-Visualisierung abweichen.
- Character-Rig-WebGL ist **nicht** Teil dieser ADR.
