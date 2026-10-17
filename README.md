# SubZeroDev.GitHub

Every GitHub repository under `The-Running-Dev` gets the same settings and the same `Main` ruleset, defined once in OpenTofu. A new project is one command; nothing is set by hand in the GitHub UI.

## What every repository gets

`modules/repository/main.tf` is the standard. In short:

- Merge, squash and rebase merges all allowed. Auto-merge on, branches deleted on merge, update-branch button on.
- Issues, projects, wiki and discussions on.
- A `Main` ruleset on the default branch: no deletion, no force-push, changes only through a pull request with every review thread resolved and stale reviews dismissed on push.
- Optional required status checks per repository.
- Removing a repository from this config archives it on GitHub. Nothing is ever deleted.

## Prerequisites

- OpenTofu: `winget install OpenTofu.Tofu`
- GitHub CLI, signed in: `gh auth login`
- A state passphrase of at least 16 characters, kept somewhere safe. State and plans are encrypted with it, and they cannot be read without it.

```powershell
$env:TF_VAR_state_passphrase = '<your passphrase>'
```

## Create a repository

```powershell
./scripts/New-Repository.ps1 -Name SubZeroDev.Thing -Description 'Does a thing' -Topics powershell,tooling
```

To publish a project that already exists locally, pass its folder. The repository is created empty, the local `main` is pushed, then the ruleset is switched on:

```powershell
./scripts/New-Repository.ps1 -Name SubZeroDev.Thing -Path D:\Dropbox\Projects\SubZeroDev.Thing
```

Required status checks take `context` or `context@integration_id` (15368 is GitHub Actions):

```powershell
./scripts/New-Repository.ps1 -Name SubZeroDev.Thing -RequiredCheck 'build / Result@15368'
```

Add `-PlanOnly` to see the plan without applying anything. The script refuses any plan that destroys or replaces a resource unless `-Force` is given.

## Change a repository

Each repository is `repositories/<name>.yaml`. Every key is optional:

```yaml
description: 'Does a thing'
homepage_url: 'https://example.com'
visibility: public          # or private
topics:
  - powershell
required_checks:
  - context: 'build / Result'
    integration_id: 15368
auto_init: true             # false when an existing history will be pushed
```

Edit the file, then:

```powershell
$env:GITHUB_TOKEN = gh auth token
tofu plan -out=change.tfplan
tofu apply change.tfplan
```

## Change the standard

Edit `modules/repository/main.tf`. The next `tofu apply` brings every repository in `repositories/` into line.

## Bring an existing repository under management

Add its YAML, then import both resources before applying:

```powershell
tofu import 'module.repository["SubZeroDev.Thing"].github_repository.this' SubZeroDev.Thing
tofu import 'module.repository["SubZeroDev.Thing"].github_repository_ruleset.main' SubZeroDev.Thing:<ruleset id>
```

A repository without a `Main` ruleset needs only the first import; the apply creates the ruleset.
