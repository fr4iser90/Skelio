## Kontext

**Phase 3 — Mesh & Skinning.** Ohne belastbare Asset-Pipeline bleiben Meshes nur im Speicher.

## Lieferobjekt

- Integration mit **Ordnerprojekt** ([ADR-0004](../../../docs/adr/0004-projekt-persistenz-ordnerprojekt.md)): Mesh-Dateien (Format-Entscheid: z. B. intern trianguliertes Format oder Import aus gängiger Quelle — im Issue/PR festhalten).
- Editor: Mesh **referenzieren**, **Bind-Pose** zum Armature-Setup zuordenbar (welche Knochen betroffen sind).

## Akzeptanzkriterien

- [ ] Speichern/Laden des Projekts behält Mesh-Referenzen + Metadaten stabil.
- [ ] Validierung: fehlende Dateien / kaputte Referenzen werden erkannt (Fehlerliste oder klare Meldung).

## Doku

- `docs/adr/0004-projekt-persistenz-ordnerprojekt.md`
- `docs/04-datenmodell-schema.md`

## Abhängigkeiten

Nutzt Domäne/Editor-Projektstruktur; kann parallel zu Schema-Issue starten, sollte vor Weight-Paint-UX fertig sein.
