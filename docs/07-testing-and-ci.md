# 07 — Testing and CI

## Commands

From the repo root:

```bash
pnpm install
pnpm test      # all workspace packages that define test
pnpm typecheck
pnpm ci        # typecheck + test (see root package.json)
```

## Package-focused runs

```bash
pnpm --filter @skelio/domain test
```

Use this when working on pose, IK, or export code.

## What to test

- **Domain:** pose evaluation, IK edge cases, validators, runtime export snapshots or structural invariants.
- **Application:** command handlers for regressions when adding commands.
- **Large local projects** (e.g. multi‑MB `Untitled.skelio.json` with embedded images): use for **manual** QA; optional automated checks in `packages/domain/src/editor/untitledSkelioAcceptance.test.ts` when that file exists at the repo root (or set **`SKELIO_UNTITLED_PATH`**). CI without the file **skips** that `describe` block; a small **synthetic** test still runs. Keep **CI fixtures** small elsewhere.

## CI expectations

Pull requests should keep **`pnpm ci`** green before merge when CI is enabled on the fork/organization.
