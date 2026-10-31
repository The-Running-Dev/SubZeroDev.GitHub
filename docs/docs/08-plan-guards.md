---
title: Plan guards
description: The checks new-repository.ts runs on every saved plan before applying it, including the target-scoped guard for automation.
---

# Plan guards

`new-repository.ts` plans the whole configuration, not just the new repository. Because of that, a plan can carry changes nobody asked for, such as drift on another repository or an edit to the standard that was never applied. Two guards in `scripts/lib/plan-guard.ts` check each saved plan, read with `tofu show -json`, before it is applied. The plan that is applied is the same file that was checked.

## Non-destructive guard

This guard is always on. It refuses any plan with a `delete` action, which includes replacements:

```text
Plan destroys or replaces: module.repository["SubZeroDev.Old"].github_repository.this. Re-run with --force if that is intended.
```

`--force` allows the plan. Deleting a repository's resource archives it rather than deleting it (see [archive on destroy](03-repository-standard.md#archive-on-destroy)), but a replacement can still recreate a ruleset, so read the plan before forcing it.

## Target-scoped guard

`--target-scoped` is for automation that is allowed to create one named repository and nothing else, such as AgentKit's `/setup-project`. Each saved plan must contain exactly the expected transition for its phase:

| Phase | Allowed changes |
| --- | --- |
| Create | A fresh `create` of `module.repository["<name>"].github_repository.this` named `<name>`, and of its `github_repository_ruleset.main` named `Main`, for repository `<name>`, targeting `branch`. Enforcement must be `active`, or `disabled` when publishing with `--path`. |
| Activate (only with `--path`) | A single `update` of that ruleset, from `disabled` to `active`. Every other attribute, nested rules included, must be identical before and after, and nothing may be unknown. |

Everything else in the plan must be a `no-op`. The guard refuses:

- a create, update, delete or replacement of any other address;
- a second change to the same address;
- a data source change;
- any move (`previous_address`) or import, even one reported as a `no-op`;
- a plan that is missing one of the expected changes.

`--force` cannot bypass this guard. It still relaxes the non-destructive guard, but the target-scoped guard refuses deletes anyway.

### Using it

Pass `--target-scoped` to both the preview and the real run. A preview does not authorize a later plan, because each run plans again and checks its own plan:

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing --target-scoped --plan-only
node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing --target-scoped
```

A caller can find out whether this version supports the guard before relying on it:

```bash
node scripts/new-repository.ts --capabilities
```

It prints `{"targetScoped":true}`. Without `--target-scoped`, the script behaves as it always has: only the non-destructive guard applies.

### When it stops

If a target-scoped run fails, the error says how far it got and leaves the definition in place:

```text
Target-scoped setup stopped: <reason> Creation apply completed; main push did not complete. Definition retained at <path>. Verify remote state before retrying; no rollback was attempted.
```

The progress part is one of:

| Progress | Meaning |
| --- | --- |
| `No apply ran.` | Nothing changed on GitHub. |
| `Creation apply did not complete and may have partially changed remote resources.` | The Create apply started and failed. The repository may exist. |
| `Creation apply completed; main push did not complete.` | The repository exists with its ruleset disabled, and is empty. |
| `Creation apply and main push completed; ruleset activation did not complete.` | `main` is pushed, but the ruleset is still disabled. |

The script never deletes a created repository or undoes a push. Check the repository on GitHub and run `tofu plan` before trying again. To finish a stopped activation by hand, run a normal `tofu plan` and `tofu apply`: without the bootstrap variable, the ruleset goes to `active`.
