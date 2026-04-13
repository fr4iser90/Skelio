# Skelio — Planungs- und Projektdokumentation

Diese Dokumentation ist die **verbindliche Planungsgrundlage** vor der Implementierung. Reihenfolge zum Lesen:

| Nr. | Dokument | Zweck |
|-----|----------|--------|
| 01 | [Vision & Strategie](01-vision-strategie.md) | Warum Skelio, Positionierung, Leitplanken |
| 02 | [Anforderungen & MVP](02-anforderungen-mvp.md) | Funktional, nicht-funktional, MVP-Scope, später |
| 03 | [Systemarchitektur](03-systemarchitektur.md) | Schichten, Module, Laufzeit, Tauri/Vue |
| 04 | [Datenmodell & Export-Schema](04-datenmodell-schema.md) | Domain-Modell, JSON, Versionierung, Migration |
| 05 | [Modulgrenzen & Schnittstellen](05-modulgrenzen-schnittstellen.md) | APIs zwischen Core, UI, I/O |
| 06 | [Designpatterns & Konventionen](06-designpatterns-konventionen.md) | Muster, Naming, Erweiterbarkeit |
| 07 | [UI & Workflow](07-ui-workflow.md) | Editor-Paradigmen, Panels, Interaktion |
| 08 | [Godot-Integration](08-godot-integration.md) | Export, Konventionen, Runtime, Tests |
| 09 | [Roadmap & Phasen](09-roadmap-phasen.md) | Meilensteine, Abhängigkeiten |
| 10 | [Teststrategie & Qualität](10-teststrategie-qualitaet.md) | Pyramide, Golddateien, CI |
| 11 | [Risiken & Nicht-Ziele](11-risiken-nichtziele.md) | Was wir bewusst nicht tun |
| 12 | [Open Source & Governance](12-opensource-governance.md) | Lizenz, Beiträge, Roadmap-Kommunikation |
| 13 | [KI-gestützte Entwicklung](13-ki-gestuetzte-entwicklung.md) | Ableitung von Cursor-Regeln aus dieser Doku |
| 14 | [Vertical Slice 1 — Tasks](14-vertical-slice-1-tasks.md) | Konkrete Implementierungsaufgaben mit Akzeptanzkriterien |

**Architecture Decision Records (ADRs):** [adr/README.md](adr/README.md)

---

Änderungen an Architektur oder Export-Format: **ADR anlegen** und ggf. `04-datenmodell-schema.md` anpassen.

## Repo-Layout (Implementierung)

| Pfad | Inhalt |
|------|--------|
| `apps/skelio-desktop/` | Vue + Tauri Desktop |
| `packages/domain/` | Domänenlogik, Runtime-Konstanten, Fixtures |
| `packages/application/` | Use Cases / Commands (wächst) |
| `packages/infrastructure/` | FS, Serializer (wächst) |
| `schemas/` | JSON Schema für Runtime-Export |
| `examples/godot-minimal/` | Godot-4-Stub |
| `.cursor/rules/` | KI-/Editor-Regeln |
