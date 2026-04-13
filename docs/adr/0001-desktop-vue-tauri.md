# ADR-0001: Desktop-Stack Vue + Tauri

## Status

angenommen

## Kontext

Skelio soll eine **moderne Desktop-UI** mit guter Systemintegration (Dateien, Menüs) und möglichst kleinem Footprint haben. Der Wunsch nach **Vue** und **Tauri** kam aus der Produktvision.

## Entscheidung

- **UI:** Vue 3 (Composition API, TypeScript).
- **Desktop-Shell:** Tauri (aktueller Major-Release zum Zeitpunkt des Scaffoldings).
- **Sprache:** TypeScript durchgängig im Frontend und Shared-Packages.

## Konsequenzen

### Positiv

- Native Dateizugriffe über Tauri-APIs.
- Vue-Ökosystem für UI-Komponenten und State.

### Negativ / Kosten

- Zwei Laufzeitwelten (Rust-Build für Tauri + Node-Tooling) erhöhen Setup-Komplexität.
- Browser-only-Version erfordert später alternative I/O-Adapter (siehe Architektur-Doku).

## Referenzen

- [03-systemarchitektur.md](../03-systemarchitektur.md)
