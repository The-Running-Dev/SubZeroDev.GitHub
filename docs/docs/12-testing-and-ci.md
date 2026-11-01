---
title: Testing and CI
description: The test suites for the scripts and the OpenTofu configuration, and the workflows that run them.
---

# Testing and CI

None of the tests touch GitHub, a token or the real state. The script tests run against a stand-in for `tofu` and local bare repositories, and the OpenTofu tests mock the `github` provider.

## Commands

| Command | What it runs | Needs |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit` over the scripts and tests. | Node.js |
| `npm run lint` | oxlint over the scripts and tests, with type information, failing on any warning. | Node.js |
| `npm test` | `node --test "tests/*.test.ts"`: the unit and script tests. | Node.js, Git, PowerShell 7 for the docs gate tests |
| `npm run test:tofu` | `tests/tofu.integration.ts`: the OpenTofu configuration and the definitions the scripts write. Skipped where `tofu` is not installed. | OpenTofu |
| `npm run smoke` | `tests/node-smoke.ts`: a real Node.js project, built, tested, linted and started. | Node.js, Git, npm registry access |
| `npm run smoke:starter -- <language>` | `tests/starter-smoke.ts`: the same for `csharp`, `rust`, `java` or `go`. | Node.js, Git, the language's toolchain and registry access |

Run `npm ci` once first. The scripts run TypeScript directly, so there is no build step.

`.oxlintrc.json` turns on oxlint's correctness rules. `--type-aware` adds the rules that need types, such as `no-floating-promises`, through `oxlint-tsgolint`, which runs on TypeScript 7; typescript-eslint does not support TypeScript 7 yet. The `describe` and `test` calls from `node:test` are exempt from `no-floating-promises`, because the runner awaits them itself.

## Script tests

| File | Covers |
| --- | --- |
| `tests/project.test.ts` | The shared project library: names, generated files, commands sections, `.gitignore` sections. |
| `tests/new-project.test.ts` | `new-project.ts` end to end, in throwaway folders. |
| `tests/new-repository.test.ts` | `new-repository.ts`, its plan guards and the publish flow, against the `tofu` stand-in and a local bare `origin`. |
| `tests/add-project-language.test.ts` | Planning, conflicts and idempotence of `add-project-language.ts`. |
| `tests/test-documentation.test.ts` | `build/Test-Documentation.ps1` against Markdown fixtures with its own rules file: link targets, heading anchors, terminology warnings and the generated-file check. Skipped where `pwsh` is not installed. |

`tests/helpers.ts` holds the shared fixtures: temporary folders removed after each test, a copy of `scripts/` with an empty `repositories/` for running a CLI, a memory log, Git helpers, and `tofuMock`, a recording stand-in that returns canned plans and outputs. The entry points take a `Context`, so the tests pass these in place of the real process runner; see [Script internals](13-script-internals.md#context).

## OpenTofu tests

`npm run test:tofu` initializes the configuration without a backend, then checks that it passes `tofu fmt -check -recursive` and `tofu validate`, and runs `tofu test`. The `tofu test` runs live in two files, each with `mock_provider "github"`:

| Run | Checks |
| --- | --- |
| `module.tftest.hcl` · `standard_repository_settings` | The repository settings in [The repository standard](03-repository-standard.md). |
| `module.tftest.hcl` · `standard_main_ruleset` | The `Main` ruleset and its rules. |
| `module.tftest.hcl` · `required_checks_become_required_status_checks` | `required_checks` turn into the required status checks rule. |
| `module.tftest.hcl` · `disabled_enforcement_is_passed_through` | `enforcement = "disabled"` reaches the ruleset. |
| `module.tftest.hcl` · `invalid_visibility_is_rejected` | Variable validation for `visibility`. |
| `module.tftest.hcl` · `invalid_enforcement_is_rejected` | Variable validation for `enforcement`. |
| `repository.tftest.hcl` · `every_yaml_file_becomes_a_repository` | Each file in `repositories/` becomes one module instance. |
| `repository.tftest.hcl` · `managed_repository_ruleset_is_active` | Rulesets are `active` by default. |
| `repository.tftest.hcl` · `bootstrap_disables_the_ruleset` | `bootstrap_repositories` disables only the named ruleset. |
| `repository.tftest.hcl` · `short_passphrase_is_rejected` | A passphrase under 16 characters fails validation. |

The same file then writes definitions with `new-repository.ts` and decodes them with OpenTofu itself. It checks that descriptions and visibility survive unchanged, that topics stay strings even when YAML would read them as booleans or numbers, that `integration_id` stays a number, and that `auto_init: false` is a boolean. See [Repository definitions](04-repository-definitions.md).

## Node smoke test

`npm run smoke` scaffolds a Node.js project with `new-project.ts --local-only` into a temporary folder whose path contains spaces. It refuses to run if the scaffolder ever calls `tofu` or `gh`. It then checks that:

- the project is on `main` with exactly one commit, a clean working tree, no remote, and no definition written;
- every tracked file has LF line endings, and both `AGENTS.md` and `CLAUDE.md` exist;
- `npm install`, `npm run build`, `npm test` and `npm run lint` succeed;
- `npm test` fails on a deliberately failing assertion, and `npm run lint` fails on an unused variable, so the checks are real;
- `package.json` points `main` at `dist/index.js`, and the tests are not compiled into `dist/`;
- `npm start` prints the greeting with `src/` moved away, so the compiled output runs on its own.

The workspace is deleted afterwards, whether the test passes or fails.

## Starter smoke test

`npm run smoke:starter -- <language>` does the same for the C#, Rust, Java and Go starters, using the commands `languageCommands` writes into the project's `README.md`. It needs the language's toolchain: the .NET 10 SDK, Rust with Clippy, Java 21 with Maven, or Go 1.24 or later. It checks that:

- the project has exactly one commit and a clean working tree, and every tracked file has LF line endings;
- the install, build, test and lint commands succeed;
- the test command fails on a deliberately failing test, and the lint command fails on a deliberate violation, each with the expected message;
- the run command prints the greeting;
- the build output is all ignored by `.gitignore`, apart from `Cargo.lock`, which a Rust application commits.

Like the Node smoke test, it refuses to run if the scaffolder calls `tofu` or `gh`, and deletes its workspace afterwards.

## Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main`, on pull requests to `main`, every Monday at 06:17 UTC, and by hand. The weekly run catches a starter broken by a new toolchain or runner image even when nothing here has changed. GitHub emails a failed scheduled run to whoever last changed the schedule, and turns the schedule off after 60 days without activity in the repository.

| Job | Runs on | Steps |
| --- | --- | --- |
| `Test` | Ubuntu, Windows and macOS × Node.js 22 and 24 | `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` |
| `Node smoke` | Ubuntu, Windows and macOS × Node.js 22 and 24 | `npm ci`, `npm run smoke` |
| `Starter smoke` | Ubuntu, Windows and macOS × `csharp`, `rust`, `java` and `go`, Node.js 24 | The toolchain from `setup-dotnet`, `setup-java`, `setup-go` or the runner's rustup, a `~/.nuget/packages` cache for C# keyed on `scripts/starters/versions/CSharpStarter.csproj` and a `~/.m2/repository` cache for Java keyed on `scripts/starters/versions/pom.xml`, then `npm ci`, `npm run smoke:starter -- <language>` |
| `OpenTofu` | Ubuntu, Node.js 24, OpenTofu from `opentofu/setup-opentofu` | `npm ci`, `npm run test:tofu` |
| `CI result` | Ubuntu, after the other four | Fails unless every job above passed. |

The workflow starts from `permissions: {}`, and each job asks only for `contents: read`. Every action is pinned to a full commit SHA, and checkout does not keep credentials. `.github/dependabot.yml` opens a weekly pull request to move those pins, and another for the npm packages. `@types/node` stays on the major version of the oldest supported Node.js. It also updates the versions the Node.js, C# and Java starters write, from the manifests in `scripts/starters/versions/`; the starter's smoke test then builds a project with each update before it merges. The npm starter versions are caret ranges, so only a new major opens a pull request.

This repository's own definition, `repositories/SubZeroDev.GitHub.yaml`, requires two checks: `CI result` and `docs / Build`. Requiring `CI result` instead of each matrix job means a job can be added, renamed or moved to another runner without changing the definition. Renaming `CI result` itself, or the `Build` job of the documentation workflow, needs the same rename in the definition, or pull requests wait on a check that never reports.

## Documentation

`.github/workflows/docs.yml` calls the shared `docs.yml` workflow from `The-Running-Dev/GitHub-ActionTemplates`. On every pull request and push to `main`, it runs `build/Test-Documentation.ps1` and builds this site. On `main`, it also deploys the site to GitHub Pages.

The gate checks links, anchors, that `docs/docs/index.md` still matches `README.md`, and the terminology in `.config/DocumentationRules.psd1`. Run it locally before pushing:

```bash
pwsh ./build/Test-Documentation.ps1
```

`README.md` is the source of the home page. After editing it, regenerate the page with `pwsh ./docs.ps1 -BuildOnly`, which also builds the site in Docker.
