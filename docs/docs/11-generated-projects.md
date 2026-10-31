---
title: Generated projects
description: The files new-project.ts writes into every project, and what the Node.js starter adds.
---

# Generated projects

`new-project.ts` writes the same common files into every project, then the language starter, if the language has one. Every generated file is UTF-8 without a byte order mark, with LF line endings and exactly one trailing newline.

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
| `CLAUDE.md` | Instructions for Claude Code: commands, architecture principles, project structure, workflow and memory guidelines. Left out with `--client codex`. |
| `AGENTS.md` | The same working agreement for Codex and other agents, with an `Essential Commands` section. Left out with `--client claude-code`. |
| `docs/architecture.md` | An architecture template dated the day it was generated. |
| `docs/decisions/0001-initial-project-setup.md` | The first architecture decision record, marked `Accepted`. |
| `.gitignore` | Secrets, IDE files, dependencies, build outputs, logs and caches, followed by the language's own lines. |
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
| `rust` | `target/`, `Cargo.lock` |
| `go` | None |

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

## Adding a starter

A starter is a function `(log, projectPath, projectName) => void` that writes its files with `writeProjectFile`. Register it in the `starters` map in `scripts/starters/index.ts`. A language with no entry in that map still gets its commands and `.gitignore` lines. New languages also need an entry in `languages`, `languageCommands` and `gitignoreSection` in `scripts/lib/project.ts`.
