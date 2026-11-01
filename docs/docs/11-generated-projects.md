---
title: Generated projects
description: The files new-project.ts writes into every project, and what each language starter adds.
---

# Generated projects

`new-project.ts` writes the same common files into every project, then the language starter. Every generated file is UTF-8 without a byte order mark, with LF line endings and exactly one trailing newline.

## Common files

```text
SubZeroDev.Thing/
├── .env.example
├── .gitattributes
├── .gitignore
├── .github/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── docs/
│   ├── architecture.md
│   └── decisions/
│       └── 0001-initial-project-setup.md
├── src/
│   └── .gitkeep
└── tests/
    └── .gitkeep
```

| File | Content |
| --- | --- |
| `README.md` | A project outline: description, prerequisites, local setup, the commands section, architecture, development workflow and license. |
| `CLAUDE.md` | Instructions for Claude Code: commands, a code map that points at the Graphify report, architecture principles, project structure, workflow and memory guidelines. Left out with `--client codex`. |
| `AGENTS.md` | The same working agreement for Codex and other agents, with an `Essential Commands` section and the same code map. Left out with `--client claude-code`. |
| `docs/architecture.md` | An architecture template dated the day it was generated. |
| `docs/decisions/0001-initial-project-setup.md` | The first architecture decision record, marked `Accepted`. |
| `.gitignore` | Secrets, IDE files, dependencies, build outputs, logs, caches and `graphify-out/`, followed by the language's own lines. |
| `.gitattributes` | `* text=auto eol=lf` |
| `.env.example` | A template for local environment variables. `.env` itself is ignored. |

`.github/` is created empty. Git does not track empty folders, so it only appears once something is added to it. `src/` and `tests/` each get a `.gitkeep` so they are committed.

## Commands sections

`README.md`, `CLAUDE.md` and `AGENTS.md` keep their commands between two markers:

```markdown
<!-- BEGIN project-commands -->
## Commands

- **Install:** `npm install`
- **Build:** `npm run build`
- **Test:** `npm test`
- **Lint/Format:** `npm run lint`
- **Run locally:** `npm start`
<!-- END project-commands -->
```

`README.md` uses a heading and a code block for each command instead of a list. While the language is undecided, the instruction files say that the project has no commands yet and that they must not be guessed, and `README.md` has an `Implementation Stack` heading marked as not selected yet. [`add-project-language.ts`](07-add-project-language.md) replaces only this undecided section; once someone edits it, the script leaves the file alone.

## Language `.gitignore` lines

| Language | Lines added |
| --- | --- |
| `node` | `node_modules/`, `.npm/`, `.next/`, `out/` |
| `csharp` | `bin/`, `obj/`, `*.user`, `.vs/` |
| `java` | `target/`, `.gradle/`, `build/` |
| `rust` | `target/` |
| `go` | `*.test`, `*.out` |

`Cargo.lock` is not ignored: the Rust starter is an application, so its lock file belongs in the repository. The common lines already ignore `bin/`, `obj/`, `build/` and `dist/`.

## Node.js starter

`scripts/starters/node.ts` sets up TypeScript, the Node.js test runner, ESLint and Prettier.

| File | Content |
| --- | --- |
| `package.json` | An ES module package named after the project, lowercased with other characters replaced by `-`. It requires Node.js `^22.13.0` or `>=24.0.0`. |
| `tsconfig.json` | Compiles `src/` to `dist/`. |
| `tsconfig.test.json` | Type-checks the tests. |
| `eslint.config.js` | An ESLint flat config with `typescript-eslint`. |
| `.prettierrc.json` | Prettier settings. |
| `src/greeting.ts`, `src/index.ts` | A greeting function and an entry point that prints it. |
| `tests/index.test.ts` | A `node:test` test of the greeting. |

| Script | Command |
| --- | --- |
| `npm run build` | `tsc` |
| `npm test` | Type-checks the tests, then runs them with `node --import tsx --test`. |
| `npm run lint` | `eslint . --max-warnings 0` |
| `npm start` | `node dist/index.js`, the compiled output. |
| `npm run dev` | `tsx watch src/index.ts` |

`npm run smoke` in this repository exercises the whole starter; see [Testing and CI](12-testing-and-ci.md#node-smoke-test).

## Other starters

Each of the other starters is the same small application: a greeting function, an entry point that prints `Welcome to <name>`, and one test of the greeting. Names are derived from the project name by `scripts/starters/names.ts`; for `SubZeroDev.Thing` they are shown in brackets below. `npm run smoke:starter -- <language>` exercises each one; see [Testing and CI](12-testing-and-ci.md#starter-smoke-test).

### C#

`scripts/starters/csharp.ts` sets up a .NET 10 solution with xUnit v3.

| File | Content |
| --- | --- |
| `<name>.slnx` | The solution, with the two projects in `/src/` and `/tests/` folders. |
| `Directory.Build.props` | `net10.0`, nullable reference types, implicit usings, warnings as errors, and the latest recommended analyzers enforced at build time. |
| `global.json` | Runs `dotnet test` on Microsoft.Testing.Platform, which xUnit v3 uses. |
| `.editorconfig` | UTF-8, LF, four-space C# and two-space XML and JSON. `dotnet format` reads it. |
| `src/<name>.csproj`, `src/Greeting.cs`, `src/Program.cs` | The console app, in the namespace made from the project name (`SubZeroDev.Thing`). |
| `tests/<name>.Tests.csproj`, `tests/GreetingTests.cs` | The xUnit v3 test project. |

### Rust

`scripts/starters/rust.ts` sets up a Cargo binary crate.

| File | Content |
| --- | --- |
| `Cargo.toml` | The package (`subzerodev-thing`), version `0.1.0`, edition 2024. |
| `src/lib.rs`, `src/main.rs` | The greeting as a library function, and the binary that prints it. |
| `tests/greeting.rs` | An integration test of the library (`subzerodev_thing::greeting`). |

### Java

`scripts/starters/java.ts` sets up a Maven project for Java 21.

| File | Content |
| --- | --- |
| `pom.xml` | Group `subzerodev.thing`, artifact `subzerodev-thing`. JUnit from its BOM, every plugin version pinned, `-Xlint:all` with warnings failing the build, a jar manifest that makes `target/app.jar` runnable, and Checkstyle with `google_checks.xml` failing on warnings. |
| `.mvn/maven.config` | `--no-transfer-progress`, which keeps download progress out of build logs. |
| `src/main/java/<package>/Greeting.java`, `App.java` | The greeting and the entry point, in Google style. |
| `src/test/java/<package>/GreetingTest.java` | A JUnit test of the greeting. |

### Go

`scripts/starters/go.ts` sets up a Go module with no dependencies.

| File | Content |
| --- | --- |
| `go.mod` | Module `subzerodev-thing`, Go 1.24. |
| `greeting.go`, `main.go` | The greeting and the entry point, in package `main`. |
| `greeting_test.go` | A test of the greeting. |

## Adding a starter

A starter is a function `(log, projectPath, projectName) => void` that writes its files with `writeProjectFile`. Register it in the `starters` map in `scripts/starters/index.ts`. New languages also need an entry in `languages`, `languageCommands` and `gitignoreSection` in `scripts/lib/project.ts`. The map has an entry for every language, so `npm run typecheck` fails on a language without a starter. Add a smoke test for it too, either in `tests/starter-smoke.ts` or, like Node, in its own file.
