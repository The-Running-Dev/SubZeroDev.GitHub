---
title: Create a repository
description: Reference for scripts/new-repository.ts, which writes a definition, plans and applies it, and can publish an existing folder.
---

# Create a repository

`scripts/new-repository.ts` adds one repository to the configuration. It writes `repositories/<name>.yaml`, plans the whole configuration, checks the plan, and applies it. [`new-project.ts`](05-new-project.md) calls it to publish a new scaffold; use it on its own for a repository without a scaffold, or for a project that already exists locally.

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --description 'Does a thing' --topics typescript,tooling
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--name` | Required | Repository name. Letters, digits, `.`, `_` and `-` only. |
| `--description` | Empty | Repository description. |
| `--visibility` | `public` | `public` or `private`. |
| `--topics` | None | Topics, lowercased. Repeat the option or separate values with commas. |
| `--required-check` | None | `context` or `context@integration_id`. Repeatable. |
| `--path` | None | An existing local repository whose `main` branch becomes the initial history. |
| `--plan-only` | Off | Show the plan and stop. Nothing is applied, and the definition is put back as it was. |
| `--force` | Off | Overwrite an existing definition, and allow a plan that destroys or replaces resources. |
| `--target-scoped` | Off | Allow only this repository's creation and ruleset activation in each plan. See [Plan guards](08-plan-guards.md). |
| `--capabilities` | Off | Print `{"targetScoped":true}` and exit, without doing anything else. |

## Before it plans

The script refuses to start unless:

- `TF_VAR_state_passphrase` is set and at least 16 characters long;
- a token is available, from `GITHUB_TOKEN` or else `gh auth token`;
- `repositories/<name>.yaml` does not exist yet, or `--force` is given;
- with `--path`, the folder exists, has a local `main` branch, and has no `origin` remote.

The token is added to the environment of `tofu` only.

## Create an empty repository

Without `--path`, the script:

1. writes the definition;
2. runs `tofu init`;
3. saves a plan to `new-repository.tfplan` and reads it back with `tofu show -json`;
4. refuses the plan if it deletes or replaces anything, unless `--force` is given;
5. applies that saved plan, so what is applied is exactly what was checked;
6. deletes the plan file, whether or not the apply succeeded.

GitHub creates the repository with an initial commit (`auto_init` defaults to `true`), and the `Main` ruleset is active from the start.

## Publish an existing folder

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing
```

The `Main` ruleset requires a pull request for every change to the default branch, so a history cannot be pushed straight into a protected repository. With `--path` the script works around this in two applies:

1. **Create.** It writes the definition with `auto_init: false` and sets `TF_VAR_bootstrap_repositories` to `["<name>"]`, so the plan creates the repository empty and the ruleset `disabled`. It then plans, checks and applies.
2. **Push.** It reads the clone URL from the `repositories` output, adds it as `origin` in the folder, and runs `git push -u origin main`.
3. **Activate.** It plans again without the bootstrap variable, so the only change is the ruleset's enforcement going from `disabled` to `active`, then checks and applies that.

The bootstrap variable lives only in the environment of these `tofu` commands. A later plan you run yourself sees the ruleset as `active`.

## Required status checks

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --required-check 'build / Result@15368'
```

The part before `@` is the check's name as GitHub reports it. The part after `@` is the numeric id of the app that must report it; 15368 is GitHub Actions. Leave out `@id` to accept the check from any app.

## Preview with --plan-only

`--plan-only` writes the definition, plans, runs the same checks, and stops. Afterwards the definition is removed again, or restored if `--force` overwrote an existing one. With `--path` only the Create plan is shown, because the Activate plan depends on the repository existing.

## Errors

A refusal prints one line on stderr and exits with code 1.

| Message | Cause |
| --- | --- |
| `Set TF_VAR_state_passphrase (16+ characters) before running.` | The passphrase is missing or too short. |
| ``GITHUB_TOKEN is not set and `gh auth token` failed.`` | No token is available. Run `gh auth login`. |
| `<definition> already exists. Edit it and run tofu apply, or re-run with --force to overwrite.` | The repository is already managed. |
| `<path> has no local main branch to push.` | The folder has no `main`. |
| `<path> already has an origin remote; …` | The folder is already connected to a remote. |
| `Plan destroys or replaces: <addresses>. Re-run with --force if that is intended.` | The plan would delete or replace a resource. |
| `tofu <command> failed with exit code <n>.` | OpenTofu failed; its own output is shown above the message. |

A failure after an apply has started is not rolled back. Check the repository on GitHub, and the state with `tofu plan`, before trying again.
