# ADR-0010: Inverse Kinematics (IK) — Zielbild & Integrationspfad

## Status

angenommen

## Kontext

**Inverse Kinematics** löst Knochenketten so, dass ein Endeffektor (z. B. Hand, Fuß) ein Ziel erreicht — unverzichtbar für viele Rigs, aber mathematisch und UX-intensiver als reine Forward Kinematics (FK). Ohne Architektur-Entscheidung drohen Inkonsistenzen (IK nur „im Editor gefaked“, ohne Export; oder doppelte Wahrheiten zwischen IK und Keys).

## Entscheidung

1. **Ziel**  
   IK ist **explizites Produktziel** (Roadmap Phase 4, siehe [09-roadmap-phasen.md](../09-roadmap-phasen.md)), **nicht** Teil des MVP-Vertical-Slice 1.

2. **Beziehung zu FK**  
   - **FK bleibt die kanonische Darstellung** der Knochentransforms im Datenmodell (Bind-Pose + animierte Kanäle wie heute).  
   - IK wird als **Constraint-/Solver-Schicht** modelliert: Sie berechnet **FK-kompatible** Werte für eine definierte Teilmenge von Knochen/Kanälen (typisch `rot`/`tx`/`ty` je nach Chain-Typ).  
   - **Keyframes** können weiterhin gesetzt werden; IK kann „darüber“ oder temporär **bake to keys** (Editor-Feature, später spezifizieren).

3. **Voraussetzungen**  
   - Zuverlässige **Timeline + FK-Export** (Phase 1 abgeschlossen).  
   - Für viele Setups sinnvoll: **stabile Bone-Limits** und sinnvolle Rest-Pose (Issues/Detail-ADR bei Implementierung).  
   - **Mesh-Skinning** ist **nicht** zwingende Voraussetzung für IK; Reihenfolge gemäß Roadmap (oft Mesh zuerst, IK danach), aber IK-Prototypen an einfachen Bones sind möglich, solange sie den FK-Vertrag nicht brechen.

4. **Solver- und UX-Scope (Richtung, keine Pflichtimplementierung)**  
   - Erste Iteration: **2-Bone analytisch** (z. B. Ellenbogen/Knie) und/oder ein iterativer Solver (**FABRIK** oder **CCD**) für Ketten — konkrete Algorithmuswahl und Toleranzen werden bei Implementierung festgelegt (optional eigener kurzer ADR oder Issue-Design-Doc).  
   - Editor-UX: Zielpunkt (Effektor), optional **Pole Vector** / Ebenennormal — Details folgen in UI-Spezifikation.

5. **Runtime-Export**  
   - **Variante A (langfristig):** IK-Constraints als optionale Runtime-Struktur (Minor-Schema), damit Engines (Godot, …) zur Laufzeit lösen können — Felddefinitionen folgen bei Implementierung.  
   - **Variante B (Übergang):** IK im Editor **baken** auf FK-Keys für den Export, sodass Runtime-JSON unverändert bleibt — für kompatible „nur Abspielen“-Pipelines ausreichend.  
   - Beide Varianten dürfen koexistieren; der Exporter dokumentiert, was er ausgibt ([ADR-0002](0002-runtime-json-schema-versioning.md)).

6. **Godot-Referenz**  
   - Wenn Runtime-IK-Metadaten existieren: Referenzplayer in GDScript ([ADR-0005](0005-godot-referenz-runtime-gdscript.md)) oder dokumentieren, dass nur **gebakte** FKs unterstützt werden, bis der Vertrag erweitert ist.

## Konsequenzen

### Positiv

- Klare Rollen: **FK = Datenkern**, **IK = Hilfsschicht** mit klaren Export-Optionen.  
- Roadmap-Phase 4 bleibt mit dieser ADR nachvollziehbar.

### Negativ / Kosten

- IK-Fehler (Singularitäten, Ziel unerreichbar) erfordern **gute Fehler- und UX-Kommunikation** im Editor.  
- Zwei Export-Modi (bake vs. Constraints) erhöhen Test- und Dokumentationslast.

## Referenzen

- [04-datenmodell-schema.md](../04-datenmodell-schema.md)  
- [09-roadmap-phasen.md](../09-roadmap-phasen.md)  
- [ADR-0006](0006-runtime-zeitbasis-sekunden.md), [ADR-0007](0007-runtime-koordinaten-rotation.md) (Einheiten/Koordinaten bei Solvern)
