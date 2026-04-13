## Kontext

**Phase 4 — IK.** Solver liefert FK-kompatible Werte für betroffene Knochen ([ADR-0010](../../../docs/adr/0010-inverse-kinematics-roadmap.md)).

## Lieferobjekt

- **MVP-Solver:** mindestens **2-Bone analytisch** für eine einfache Kette ODER dokumentierter **FABRIK/CCD**-Prototyp mit festen Toleranzen.
- Integration in den Editor-Loop: Zeit scrubben → IK löst → Pose aktualisiert Inspector/Viewport.
- Randfälle: Ziel unerreichbar, Kette degeneriert — **Warnung** oder Clamp (Verhalten dokumentieren).

## Akzeptanzkriterien

- [ ] Reproduzierbare Ergebnisse für dieselben Eingaben (deterministisch im Toleranzrahmen).
- [ ] Kurze technische Notiz (Kommentar oder `docs/`) zu gewähltem Algorithmus und Limits.

## Doku

- `docs/adr/0010-inverse-kinematics-roadmap.md`

## Abhängigkeiten

Baut auf IK-Datenmodell/UI-Issue auf.
