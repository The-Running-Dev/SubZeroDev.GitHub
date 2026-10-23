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

## Create a project

One command scaffolds the project, commits it on `main`, creates the repository and pushes it:

```powershell
./scripts/New-Project.ps1 -Name SubZeroDev.Thing -Language node -Description 'Does a thing' -Topics node,tooling
```

The project goes next to this repository (`../SubZeroDev.Thing`) unless `-Path` says otherwise. It gets `src/`, `tests/`, `docs/architecture.md`, a first ADR, `.gitignore`, `.gitattributes`, `.env.example`, `README.md`, `CLAUDE.md` and `AGENTS.md` (`-Client ClaudeCode` or `-Client Codex` for one of them), plus the language starter from `scripts/starters/<language>.ps1`. `node` and `python` have starters; `csharp`, `rust`, `java` and `go` get the common files only.

- `-SkipValidation` skips running the build and test commands. A failure there is reported, not fatal.
- `-LocalOnly` stops after the commit. Publish later with `New-Repository.ps1 -Path`.
- `-PlanOnly` scaffolds and commits, then shows the GitHub plan without applying it.
- `-Visibility`, `-Topics` and `-RequiredCheck` are passed to `New-Repository.ps1`.

The Node starter requires Node.js 22.13+ on the 22.x line, or Node.js 24+. After `npm install`, run
`npm run build`, `npm test`, `npm run lint`, then `npm start`. TypeScript source
builds to `dist/`; startup runs that compiled output. Tests use Node's test runner with tsx and lint
uses ESLint 10 with a TypeScript flat config. `npm run dev` watches the source with tsx.

## Create a repository

For a repository with no scaffold, or a project that already exists locally:

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

## Test

```powershell
Invoke-Pester tests
```

The scripts run against a stand-in for `tofu` and a local bare repository, so nothing touches GitHub or the real state. Tests tagged `Tofu` also run `tofu fmt`, `validate` and `tofu test` (the github provider is mocked); they skip when OpenTofu is not installed. Run only those with `Invoke-Pester tests -TagFilter Tofu`.

Run the real Node toolchain smoke test separately (requires Git, Node.js 22.13+ on 22.x or 24+
and npm registry access, but no Pester, GitHub credentials or OpenTofu):

```powershell
./tests/Invoke-NodeSmokeTest.ps1
```

It scaffolds with `-LocalOnly` into a temporary workspace, installs dependencies,
builds, tests and lints, then starts the compiled application with the source
directory removed. It also verifies that a failing assertion and a TypeScript
lint violation are rejected. The workspace is
deleted even if a check fails. CI runs it on Ubuntu and Windows with Node 22 and 24.
