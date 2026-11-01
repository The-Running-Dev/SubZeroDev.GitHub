# SubZeroDev.GitHub

Every GitHub repository under `The-Running-Dev` gets the same settings and the same `Main` ruleset, defined once in OpenTofu. A new project is one command; nothing is set by hand in the GitHub UI.

## Documentation

Each part has its own page on the [documentation site](https://the-running-dev.github.io/SubZeroDev.GitHub/):

- [Getting started](https://the-running-dev.github.io/SubZeroDev.GitHub/getting-started): tools, the state passphrase and the GitHub token.
- [The repository standard](https://the-running-dev.github.io/SubZeroDev.GitHub/repository-standard) and [repository definitions](https://the-running-dev.github.io/SubZeroDev.GitHub/repository-definitions): what every repository gets, and the keys of `repositories/<name>.yaml`.
- [Create a project](https://the-running-dev.github.io/SubZeroDev.GitHub/new-project), [create a repository](https://the-running-dev.github.io/SubZeroDev.GitHub/new-repository) and [add a project language](https://the-running-dev.github.io/SubZeroDev.GitHub/add-project-language): the three scripts, option by option.
- [Plan guards](https://the-running-dev.github.io/SubZeroDev.GitHub/plan-guards): what is checked before every apply.
- [OpenTofu configuration](https://the-running-dev.github.io/SubZeroDev.GitHub/opentofu-configuration) and [day-to-day operations](https://the-running-dev.github.io/SubZeroDev.GitHub/operations): changing, importing and archiving repositories.
- [Generated projects](https://the-running-dev.github.io/SubZeroDev.GitHub/generated-projects): the files a new project starts with.
- [Testing and CI](https://the-running-dev.github.io/SubZeroDev.GitHub/testing-and-ci) and [script internals](https://the-running-dev.github.io/SubZeroDev.GitHub/script-internals): for changing this repository.

## What every repository gets

`modules/repository/main.tf` is the standard. In short:

- Merge, squash and rebase merges all allowed. Auto-merge on, branches deleted on merge, update-branch button on.
- Issues, projects, wiki and discussions on.
- A `Main` ruleset on the default branch: no deletion, no force-push, changes only through a pull request with every review thread resolved and stale reviews dismissed on push.
- Optional required status checks per repository.
- Removing a repository from this config archives it on GitHub. Nothing is ever deleted.

## Prerequisites

The scripts run on Windows, macOS and Linux.

- Node.js 22.18+ (TypeScript runs directly; there is no build step). Run `npm ci` once.
- Git.
- OpenTofu: https://opentofu.org/docs/intro/install/ (`winget install OpenTofu.Tofu`, `brew install opentofu`, ...)
- GitHub CLI, signed in: `gh auth login`
- A state passphrase of at least 16 characters, kept somewhere safe. State and plans are encrypted with it, and they cannot be read without it.

```bash
export TF_VAR_state_passphrase='<your passphrase>'
```

## Create a project

One command scaffolds the project, commits it on `main`, creates the repository and pushes it:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --language node --description 'Does a thing' --topics node,tooling
```

The project goes next to this repository (`../SubZeroDev.Thing`) unless `--path` says otherwise. It gets `src/`, `tests/`, `docs/architecture.md`, a first ADR, `.gitignore`, `.gitattributes`, `.env.example`, `README.md`, `CLAUDE.md` and `AGENTS.md` (`--client claude-code` or `--client codex` for one of them), plus the language starter from `scripts/starters/<language>.ts`. Every language has one: a small application that prints a greeting, with a test and a lint setup.

- `--skip-validation` skips running the build and test commands. A failure there is reported, not fatal.
- `--local-only` stops after the commit. Publish later with `new-repository.ts --path`.
- `--plan-only` scaffolds and commits, then shows the GitHub plan without applying it.
- `--visibility`, `--topics` and `--required-check` are passed to `new-repository.ts`.

The Node starter requires Node.js 22.13+ on the 22.x line, or Node.js 24+. After `npm install`, run
`npm run build`, `npm test`, `npm run lint`, then `npm start`. TypeScript source
builds to `dist/`; startup runs that compiled output. Tests use Node's test runner with tsx and lint
uses ESLint 10 with a TypeScript flat config. `npm run dev` watches the source with tsx.

The other starters follow the same shape:

- `csharp`: a .NET 10 solution (`.slnx`) with a console app in `src/` and an xUnit v3 test project in `tests/`, warnings as errors, and `dotnet format` as the lint.
- `rust`: a Cargo binary crate on edition 2024, with a library function, an integration test, and Clippy with warnings denied.
- `java`: a Maven project for Java 21 with JUnit, Checkstyle in Google style, and a runnable `target/app.jar`.
- `go`: a Go module with a `main` package, a test, and `go vet` as the lint.

### Without a language

`--language` is optional. Leave it out while the implementation language is still undecided:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --local-only
```

The project gets the same common files, committed on `main`, but no starter and no validation. `README.md`, `CLAUDE.md` and `AGENTS.md` say the language is not selected yet instead of listing install, build, test, lint and run commands. Publishing works the same way.

When the language is chosen, add it:

```bash
node scripts/add-project-language.ts --path ../SubZeroDev.Thing --language node
```

It writes the starter files that do not exist yet, appends the language's `.gitignore` lines, and replaces the undecided commands section of each instruction file. Everything is checked first: if a starter file already exists with other content, or a commands section was edited, it writes nothing and lists each conflict. It never commits, and running it again changes nothing.

## Create a repository

For a repository with no scaffold, or a project that already exists locally:

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --description 'Does a thing' --topics typescript,tooling
```

To publish a project that already exists locally, pass its folder. The repository is created empty, the local `main` is pushed, then the ruleset is switched on:

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing
```

Required status checks take `context` or `context@integration_id` (15368 is GitHub Actions):

```bash
node scripts/new-repository.ts --name SubZeroDev.Thing --required-check 'build / Result@15368'
```

Add `--plan-only` to see the plan without applying anything. The script refuses any plan that destroys or replaces a resource unless `--force` is given.

For automation authorized to create only the named repository, pass `--target-scoped`
to both the preview and the publishing invocation. Each exact saved plan is checked
immediately before apply: creation must create only the named repository and its
`Main` ruleset; after pushing `main`, activation may only update that ruleset's
enforcement from `disabled` to `active`, with every other attribute unchanged and
known. Unrelated no-ops are allowed. Imports, moves, other creates or updates,
deletions and replacements are refused, even with `--force`. A preview does not
authorize a later plan. Without `--target-scoped`, the existing whole-configuration
behavior is unchanged. `--capabilities` prints `{"targetScoped":true}` so callers can
check for the guard before relying on it.

If scoped publishing stops, its error reports the completed apply/push stages and
the retained definition path. A failed apply can be partial; verify remote state
before retrying. The script does not roll back a created repository or a push.

## Change a repository

Each repository is `repositories/<name>.yaml`. Every key is optional:

```yaml
description: 'Does a thing'
homepage_url: 'https://example.com'
visibility: public          # or private
topics:
  - typescript
required_checks:
  - context: 'build / Result'
    integration_id: 15368
auto_init: true             # false when an existing history will be pushed
```

Edit the file, then:

```bash
export GITHUB_TOKEN="$(gh auth token)"
tofu plan -out=change.tfplan
tofu apply change.tfplan
```

## Change the standard

Edit `modules/repository/main.tf`. The next `tofu apply` brings every repository in `repositories/` into line.

## Bring an existing repository under management

Add its YAML, then import both resources before applying:

```bash
tofu import 'module.repository["SubZeroDev.Thing"].github_repository.this' SubZeroDev.Thing
tofu import 'module.repository["SubZeroDev.Thing"].github_repository_ruleset.main' SubZeroDev.Thing:<ruleset id>
```

A repository without a `Main` ruleset needs only the first import; the apply creates the ruleset.

## Test

```bash
npm run typecheck
npm run lint
npm test
```

The scripts run against a stand-in for `tofu` and a local bare repository, so nothing touches GitHub or the real state. The OpenTofu checks run separately and skip when OpenTofu is not installed: `tofu fmt`, `validate` and `tofu test` (the github provider is mocked), plus a check that the YAML the scripts write decodes as intended:

```bash
npm run test:tofu
```

Run the real Node toolchain smoke test separately (requires Git, Node.js 22.18+ and npm
registry access, but no GitHub credentials or OpenTofu):

```bash
npm run smoke
```

It scaffolds with `--local-only` into a temporary workspace, installs dependencies,
builds, tests and lints, then starts the compiled application with the source
directory removed. It also verifies that a failing assertion and a TypeScript
lint violation are rejected. The workspace is
deleted even if a check fails.

The other starters have their own smoke test, which needs the language's toolchain instead of npm:

```bash
npm run smoke:starter -- csharp
```

It scaffolds the project the same way, runs its install, build, test and lint commands, checks that a failing test and a lint violation are rejected, runs the application, and checks that the build output is ignored by `.gitignore`. CI runs the tests and the Node smoke test on Ubuntu, Windows and macOS with Node 22 and 24, and the starter smoke test for `csharp`, `rust`, `java` and `go` on all three.
