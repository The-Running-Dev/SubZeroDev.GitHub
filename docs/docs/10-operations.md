---
title: Day-to-day operations
description: Changing, importing, archiving and checking managed repositories with plain tofu commands.
---

# Day-to-day operations

Anything other than creating a repository is a plain OpenTofu workflow. Each section below assumes that the credentials are set:

```bash
export TF_VAR_state_passphrase='<your passphrase>'
export PG_CONN_STR='<state database connection string>'
export GITHUB_TOKEN="$(gh auth token)"
```

Make configuration changes on a branch and merge them through a pull request, like any other change to this repository. Apply after the pull request merges, so `main` always matches what is on GitHub.

## Change a repository

Edit `repositories/<name>.yaml`; the keys are described in [Repository definitions](04-repository-definitions.md). Then save a plan, read it, and apply exactly that plan:

```bash
tofu plan -out=change.tfplan
tofu apply change.tfplan
```

The saved plan is encrypted with the same passphrase as the state.

## Change the standard

Edit `modules/repository/main.tf`. The next apply brings every repository in `repositories/` into line with it. See [The repository standard](03-repository-standard.md#changing-the-standard).

## Check for drift

```bash
tofu plan
```

A plan with no changes means GitHub matches the definitions. Any change it shows was made outside this configuration, for example by hand in the GitHub UI. The next apply reverts it, unless the definition is updated to keep it.

The [Drift workflow](12-testing-and-ci.md#drift-detection) runs the same plan every Monday and fails if it finds anything.

## Move the state to PostgreSQL

Before the `pg` backend, the state was the local `terraform.tfstate`. To move an existing local state into the database once, with the passphrase and `PG_CONN_STR` set:

```bash
tofu init -migrate-state
tofu plan
```

Answer `yes` when OpenTofu asks to copy the state. The state stays encrypted with the same passphrase. When the plan shows no changes, keep `terraform.tfstate` and `terraform.tfstate.backup` somewhere safe for a while, then delete them from the repository folder.

## Bring an existing repository under management

Add its definition, then import both of its resources before applying:

```bash
tofu import 'module.repository["SubZeroDev.Thing"].github_repository.this' SubZeroDev.Thing
tofu import 'module.repository["SubZeroDev.Thing"].github_repository_ruleset.main' SubZeroDev.Thing:<ruleset id>
```

The ruleset id is in the ruleset's URL on GitHub (Settings, then Rules, then Rulesets). A repository without a `Main` ruleset needs only the first import; the apply then creates the ruleset.

Set `auto_init: false` in the definition of an imported repository that already has history. After importing, `tofu plan` shows every way the repository differs from the standard. Applying it brings the repository into line.

## Archive a repository

Delete its definition and apply:

```bash
git rm repositories/SubZeroDev.Old.yaml
tofu plan -out=archive.tfplan
tofu apply archive.tfplan
```

The plan shows both resources being destroyed. Because of `archive_on_destroy`, the repository is archived on GitHub, not deleted. The ruleset is removed. The repository is then read-only and no longer managed here.

## Stop managing a repository without archiving it

Remove it from the state first, then delete its definition:

```bash
tofu state rm 'module.repository["SubZeroDev.Thing"]'
git rm repositories/SubZeroDev.Thing.yaml
```

The repository and its ruleset stay on GitHub exactly as they are.

## Finish a stopped publish

If `new-repository.ts --path` stopped after pushing `main` but before activating the ruleset, a normal plan and apply finishes the job. Without the bootstrap variable, the plan updates the ruleset's enforcement to `active`. See [Plan guards](08-plan-guards.md#when-it-stops).
