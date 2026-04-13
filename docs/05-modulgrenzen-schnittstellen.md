# Modulgrenzen & Schnittstellen

## Paket-/Ordner-Vorschlag (Monorepo)

```
packages/
  domain/          # rein funktional, keine Vue/Tauri
  application/     # Use Cases, Command-Handler
  infrastructure/ # fs, serializers, paths
  editor/          # Vue app + viewport
  export-godot/    # optional: spezifische Konverter/Hilfen
```

> Exakte Repo-Struktur wird beim Scaffold festgelegt; die **logische** Trennung ist verbindlich.

## Öffentliche Schnittstellen

### 1. `domain`

**Exportiert:** Typen und fabriklose Operationen, z. B.:

- `createBone(parentId, name): Bone`
- `validateArmature(armature): ValidationResult`
- `sampleAnimation(armature, animationId, time): Pose`

**Importiert:** Nichts aus Vue/Tauri.

### 2. `application`

**Exportiert:**

- `Command`-Typen und `applyCommand(state, command)` / `undo` Stacks
- Hochlevel-API: `addBone`, `setKeyframe`, `exportRuntime(project): Result`

**Importiert:** `domain`, `infrastructure` (nur über Interfaces — **Dependency Inversion**).

### 3. `infrastructure`

**Exportiert:**

- `FileStore` Interface + Tauri-Implementation
- `readProject(path)`, `writeProject(path, snapshot)`
- `buildRuntimeJson(project): string` (ruft Domain-Reducer auf)

**Importiert:** `domain` (für Serialisierungshilfen), keine Vue.

### 4. `editor` (Vue)

**Exportiert:** nur die gebaute App (keine Lib für andere Consumer im MVP).

**Importiert:** `application` als einzige „Fach“-Schicht.

## Grenzen durch Interfaces (Beispiele)

| Interface | Zweck |
|-----------|--------|
| `Clock` | Aktuelle Zeit / Playback (testbar mit Fake) |
| `FilePicker` | Öffnen/Speichern (Tauri vs. Browser) |
| `Renderer2D` | Viewport zeichnet aus `Pose` + Editor-Overlay |
| `Exporter` | Runtime-JSON erzeugen, Fehler sammeln |

## Ereignisfluss (UI → Domain)

1. UI löst **Command** aus (nicht rohe Mutation).
2. **Command Handler** validiert, wendet auf **Project Snapshot** an.
3. **History** speichert inverse Operation oder Snapshot-Diff (Strategie per ADR).
4. UI abonniert **Projection** (read model): z. B. `currentPose`, `selectedBoneId`.

Vermeiden: globales `window.project = reactive(...)` ohne Command-Pfad.

## Interne vs. externe APIs

- **Extern (Open Source Community):** Runtime-JSON-Schema, ggf. stabile „Extension Points“ dokumentieren.
- **Intern:** Alles unter `packages/` bis stabile Plugin-API existiert.

## Godot-Paket

Separates Repo **oder** Unterordner `godot/addons/skelio_runtime/` — Entscheidung in [08-godot-integration.md](08-godot-integration.md). Schnittstelle ist **nur** das JSON + ggf. kleine Metadatei (`.import` Hinweise).
