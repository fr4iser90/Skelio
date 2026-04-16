# 08 — Desktop application

## Stack

- **Vue 3** + **Pinia** for UI state.
- **Tauri** for a native window, menus, and OS integration where used.

## Running

```bash
pnpm dev
```

Runs the desktop package’s dev server (Vite). A **full Tauri** dev loop may require:

```bash
cd apps/skelio-desktop && pnpm tauri dev
```

…with Rust and [Tauri prerequisites](https://tauri.app/start/prerequisites/) installed.

## Viewport modes

The editor exposes **rig camera** modes such as `2d`, `2.5d`, and `3d` (see store and viewport components). **2D orthographic** mode may pass `planar2dNoTiltSpin` into pose evaluation so planar IK assumptions match the view.

## Related

- Domain pose behavior: [09-domain-editor-pipeline.md](./09-domain-editor-pipeline.md)
- UI boundaries: [05-module-boundaries.md](./05-module-boundaries.md)
