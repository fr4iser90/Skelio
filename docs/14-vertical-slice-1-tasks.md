# 14 — Vertical slice 1 (MVP tasks)

This slice defines a **minimal shippable loop**: author → animate → export → play in Godot (or documented stub player).

## Task themes

Each item should have **acceptance criteria** in your issue tracker. Below is a checklist-style breakdown you can copy into GitHub issues.

### A. Project and persistence

- [ ] Create/open/save project (path and format documented).
- [ ] Corrupt / invalid file surfaces a clear error (no silent data loss).

### B. Rigging

- [ ] Create bone hierarchy with sensible defaults.
- [ ] Edit bind pose and lengths in a dedicated flow (e.g. character rig modal / quick rig).
- [ ] At least one **two-bone IK** chain can be added, enabled, and manipulated.

### C. Animation

- [ ] Timeline scrubbing and playback.
- [ ] Keyframes on core channels (`tx`, `ty`, `rot`) for selected bones.
- [ ] Clip duration and FPS respected in UI.

### D. Mesh / skinning (as far as MVP requires)

- [ ] Attach or generate a skinned mesh path needed for demo.
- [ ] Weight edit loop usable for a simple character (even if rough).

### E. Export

- [ ] Export JSON validates against `schemas/runtime-1.1.0.json`.
- [ ] `schemaVersion` matches `RUNTIME_SCHEMA_VERSION`.

### F. Godot path

- [ ] Documented steps or sample scene to load export (may start as minimal viewer).

## Automation

If `scripts/create-vertical-slice-1-issues.sh` and `.github/issues/vertical-slice-1/` exist in your checkout, use them to bulk-create issues; otherwise create issues manually from this list.

## Related

Known weaknesses and follow-ups: [15-product-gaps-and-roadmap.md](./15-product-gaps-and-roadmap.md)
