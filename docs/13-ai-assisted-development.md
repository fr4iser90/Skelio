# 13 — AI-assisted development

## For humans using Cursor / Copilot / etc.

- Read **[AGENTS.md](../AGENTS.md)** first — it is the short automation contract.
- Follow **[05-module-boundaries.md](./05-module-boundaries.md)** and **[06-design-patterns-and-conventions.md](./06-design-patterns-and-conventions.md)** so generated code respects layers.
- Never “fix” runtime JSON by editing only the UI; fix **domain + schema + tests** together.

## For maintainers

- Cursor rules under **`.cursor/rules/`** point at these docs; update rules when doc paths change.
- Prefer small PRs with clear intent; avoid drive-by refactors mixed with feature work.

## Runtime safety

If a model suggests changing export shape: require **ADR**, **schema bump**, **fixtures**, and explicit mention in **`schemas/CHANGELOG.md`**.
