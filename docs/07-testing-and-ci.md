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

## CI expectations

Pull requests should keep **`pnpm ci`** green before merge when CI is enabled on the fork/organization.
