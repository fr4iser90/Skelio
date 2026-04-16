# 03 — System architecture

## Layered design

```mermaid
flowchart TB
  UI[apps/skelio-desktop Vue UI]
  APP[@skelio/application commands]
  DOM[@skelio/domain pure logic]
  INF[@skelio/infrastructure IO]
  UI --> APP
  APP --> DOM
  APP --> INF
  DOM --> RUN[Runtime JSON]
```

1. **UI** renders state and sends **commands** (intentions), it does not own canonical mutation rules.
2. **Application** applies commands to produce the next `EditorProject` (or rejects invalid transitions).
3. **Domain** holds types, pose math, IK solvers, validation, export mapping — **framework-free**.
4. **Infrastructure** persists and loads files; stays free of Vue.

## Runtime export

Editor project state is **mapped** to runtime JSON (anti-corruption boundary). The file shape is governed by `schemas/runtime-1.1.0.json`, not by internal editor types.

## Related docs

- Boundaries: [05-module-boundaries.md](./05-module-boundaries.md)
- Conventions: [06-design-patterns-and-conventions.md](./06-design-patterns-and-conventions.md)
- Pose pipeline: [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md)
