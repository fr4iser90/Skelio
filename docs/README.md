# Skelio documentation

Numbered guides **00–16** are the canonical developer narrative. [AGENTS.md](../AGENTS.md) summarizes what automation should read first.

## Index (00–15)

| Doc | Topic |
|-----|--------|
| [00-overview.md](./00-overview.md) | What Skelio is, audience, non-goals |
| [01-vision-and-scope.md](./01-vision-and-scope.md) | Product direction and MVP boundaries |
| [02-repository-structure.md](./02-repository-structure.md) | Monorepo layout (`apps/`, `packages/`) |
| [03-system-architecture.md](./03-system-architecture.md) | Layers and data flow |
| [04-data-model-schema.md](./04-data-model-schema.md) | Runtime JSON contract (with JSON Schema) |
| [05-module-boundaries.md](./05-module-boundaries.md) | Package responsibilities and forbidden imports |
| [06-design-patterns-and-conventions.md](./06-design-patterns-and-conventions.md) | Commands, state mutation, naming |
| [07-testing-and-ci.md](./07-testing-and-ci.md) | Tests, typecheck, CI expectations |
| [08-desktop-application.md](./08-desktop-application.md) | Tauri + Vue desktop app |
| [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md) | Poses, IK/FK, rigs, meshes (domain) |
| [10-runtime-export.md](./10-runtime-export.md) | From editor project to runtime file |
| [11-godot-integration.md](./11-godot-integration.md) | Consuming runtime JSON in Godot (notes) |
| [12-contributing-and-community.md](./12-contributing-and-community.md) | PRs, conduct, where to discuss |
| [13-ai-assisted-development.md](./13-ai-assisted-development.md) | Agents, Cursor rules, safe automation |
| [14-vertical-slice-1-tasks.md](./14-vertical-slice-1-tasks.md) | MVP slice tasks and acceptance hints |
| [15-product-gaps-and-roadmap.md](./15-product-gaps-and-roadmap.md) | Known gaps and planned work |
| [16-character-setup-animate-boundary.md](./16-character-setup-animate-boundary.md) | **Character Setup vs Animate** — non-negotiable separation (rigging vs animation) |

## Other material

- **ADRs:** [adr/README.md](./adr/README.md)
- **Runtime JSON Schema (machine-readable):** `schemas/runtime-1.1.0.json` (legacy: `runtime-1.0.0.json`)
- **Schema changelog:** `schemas/CHANGELOG.md`

## Repo commands

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev
```

`pnpm dev` runs the desktop app filter; full Tauri window needs Rust — see [08-desktop-application.md](./08-desktop-application.md).
