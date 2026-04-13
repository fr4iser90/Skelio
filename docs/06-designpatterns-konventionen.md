# Designpatterns & Konventionen

## 1. Command Pattern (Undo/Redo)

**Warum:** Jede Benutzeraktion wird zu einem reversiblen `Command`.

**Konventionen:**

- `execute(project): Result<Project, Error>`
- `undo(project): Project` **oder** History hält **Inverse Commands** — eine Variante wählen und in ADR festhalten.
- Commands sind **klein** und granular (`SetBoneRotation`, nicht „MegaPaste“).

## 2. Immutable Snapshots (empfohlen für Domain)

**Warum:** Vorhersagbare Updates, einfaches Time-Travel für Undo, leichtere Tests.

**Pragmatismus:** Für große Arrays später **structural sharing** (z. B. Immer) evaluieren — nicht MVP-blockierend, aber API so wählen, dass ein Wechsel möglich bleibt.

## 3. CQRS-light

- **Commands** ändern den Zustand.
- **Selectors/Queries** lesen abgeleitete Daten (`getWorldTransform(boneId)`).

Kein schweres Event-Sourcing nötig; nur die Trennung beibehalten.

## 4. Factory + Validation beim Rand

- Beim **Laden** von Dateien: `parseProject(raw): Result<Project, ParseError>`.
- Beim **Rand** (I/O) strikt validieren; im Inneren **Invarianten** durch Typen + Assertions (dev).

## 5. Anti-Corruption Layer für Export

Ein Modul `export/runtime/v1/mapProjectToRuntime.ts` (Name beliebig) mappt internes `Project` → **Runtime DTO**. So bleibt internes Modell refactorbar ohne Export zu brechen.

## 6. Fehlerbehandlung

- **Result-Typ** (`ok` / `err`) oder `neverthrow` — konsistent im `application`/`domain`.
- UI zeigt **aggregierte** Validierungsfehler beim Export (Liste), nicht nur Toast.

## 7. Naming

| Bereich | Konvention |
|---------|------------|
| TypeScript | `PascalCase` Typen, `camelCase` Funktionen/Variablen |
| JSON Export | **`camelCase`** global — [ADR-0008](adr/0008-runtime-json-camelcase.md) |
| Dateien | `kebab-case.ts` für Module |

## 8. Tests an Mustern ausrichten

- **Domain:** reine Unit-Tests ohne DOM.
- **Application:** Command + Undo Ketten.
- **Export:** Goldfile-JSON gegen Fixture.

## 9. State in Vue

- Ein **`projectStore`** (Pinia oder lightweight composable) hält **nur** Referenz auf aktuellen Snapshot + Selection Meta.
- **Keine** Duplikation der Knochen-Hierarchie in „lokaler“ Form, die aus dem Domain-Snapshot abweichen kann.

## 10. Erweiterbarkeit (vorbereitet)

- Stabile **Port-Interfaces** in `application` für spätere Plugins (`registerImporter`, `registerExporter`).
- MVP: Interfaces existieren dürfen, Implementierung „NoOp“.
