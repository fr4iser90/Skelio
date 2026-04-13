# KI-gestützte Entwicklung (Cursor & Co.)

Dieses Dokument beschreibt, wie aus der **Projektdokumentation** stabile **KI-Regeln** und Arbeitsanweisungen abgeleitet werden — **ohne** die Doku zu duplizieren.

## Prinzip

Die KI soll **nie** im Vakuum raten:

1. **Single source of truth:** `docs/` + `docs/adr/`.
2. **Kurzregeln** in `.cursor/rules/` verweisen auf die richtigen Abschnitte und wiederholen nur **nicht verhandelbare** Invarianten.
3. **Tasks** für die KI sind klein: „Implementiere Parser gemäß Abschnitt X in Doku Y“.

## Cursor-Struktur (angelegt)

```
.cursor/rules/
  skelio-architecture.mdc
  skelio-domain.mdc
  skelio-runtime-export.mdc
  skelio-godot.mdc
```

Jede `.mdc`-Datei enthält:

- **Geltungsbereich** (`globs`: z. B. `packages/domain/**`)
- **3–10 harte Regeln** (z. B. „Keine Vue-Imports in `packages/domain`“)
- **Links** zu den Markdown-Dokumenten im Repo (relative Pfade)

## Invarianten, die sich für Rules eignen

Aus [06-designpatterns-konventionen.md](06-designpatterns-konventionen.md):

- Commands für jede mutation; kein direktes Patchen des Domain-Objekts aus Vue.
- Export nur über Anti-Corruption-Layer in Runtime-DTO.

Aus [05-modulgrenzen-schnittstellen.md](05-modulgrenzen-schnittstellen.md):

- `domain` importiert weder `vue` noch `@tauri-apps/*`.

Aus [04-datenmodell-schema.md](04-datenmodell-schema.md):

- Jedes exportierte JSON **muss** `schemaVersion` enthalten.
- Breaking Changes nur mit ADR + Fixture-Update.

## Prompt-Vorlagen für Implementierungs-Tasks

**Parser / Schema:**

> Lies `docs/04-datenmodell-schema.md` und ADR `docs/adr/0002-*.md`. Implementiere `parseProject` mit den Validierungen aus Abschnitt „Validierung vor Export“. Schreibe Tests mit Fixtures unter `packages/domain/test/fixtures/`.

**UI:**

> Lies `docs/07-ui-workflow.md`. Implementiere nur den Viewport-Selektionspfad; keine neue Domain-Logik in `.vue` — nutze `application` Commands.

**Godot:**

> Lies `docs/08-godot-integration.md`. Aktualisiere `examples/godot-minimal/` so, dass …

## Review-Prozess mit KI

1. KI erstellt PR-ähnlichen Diff.
2. Mensch prüft gegen **Checkliste** in [10-teststrategie-qualitaet.md](10-teststrategie-qualitaet.md).
3. Bei Schema-Touch: **ADR** + Snapshot.

## Drift verhindern

Wenn Code von der Doku abweicht:

- **Entweder** Doku anpassen (mit Begründung im PR),
- **oder** Code korrigieren.

Stillen Drift ohne ADR vermeiden.

## Optional: `AGENTS.md` (Root)

Kurzdatei für beliebige Agenten:

- Projektname, Stack, `pnpm i`, `pnpm test`.
- Verweis: „Lies zuerst `docs/README.md`.“

Diese Datei kann beim Scaffold ergänzt werden.
