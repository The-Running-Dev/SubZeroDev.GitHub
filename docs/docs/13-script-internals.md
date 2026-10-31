---
title: Script internals
description: How the TypeScript scripts are put together, for anyone changing them or calling them from other code.
---

# Script internals

The scripts are plain TypeScript that Node.js 22.18 or later runs directly, with type stripping and no build step. Their only dependencies are Node.js's own modules.

## Layout

```text
scripts/
├── new-project.ts            Entry point: scaffold a project
├── new-repository.ts         Entry point: create or publish a repository
├── add-project-language.ts   Entry point: add a language to a project
├── lib/
│   ├── context.ts            The Context passed to every entry point
│   ├── runtime.ts            Node.js version check, main(), isMain()
│   ├── options.ts            Command-line parsing helpers
│   ├── process.ts            run, runShell, findExecutable
│   ├── files.ts              writeProjectFile and line ending normalization
│   ├── log.ts                Console output
│   ├── project.ts            Languages, commands and the common generated files
│   ├── yaml.ts               Writes repositories/*.yaml
│   └── plan-guard.ts         The plan guards
└── starters/
    ├── index.ts              The starters registry
    └── node.ts
```

## Context

Everything an entry point touches outside its arguments comes in through a `Context`:

| Field | Default | Purpose |
| --- | --- | --- |
| `root` | The repository root | Where `repositories/` and the OpenTofu configuration live. |
| `env` | `process.env` | Environment variables, such as `GITHUB_TOKEN` and `TF_VAR_state_passphrase`. |
| `run` | `run` from `process.ts` | Runs `git`, `gh` and `tofu`. |
| `shell` | `runShell` from `process.ts` | Runs a language's validation commands. |
| `log` | `createLog()` | Writes progress to the console. |

`defaultContext()` builds the real one. Tests pass their own, with a temporary root, a recording `tofu` stand-in and a memory log.

## Entry points

Each entry point exports its main function, its option definitions and a `run(args, ctx)` that parses arguments and calls the main function:

| Script | Function | Options type |
| --- | --- | --- |
| `new-project.ts` | `createProject(options, ctx)` | `ProjectOptions` |
| `new-repository.ts` | `createRepository(options, ctx)` | `RepositoryOptions` |
| `add-project-language.ts` | `addProjectLanguage(options, ctx)` | `LanguageOptions` |

`new-project.ts` calls `createRepository` directly to publish. Other code, such as the tests and the smoke test, can import these functions instead of starting a process.

A script only runs its command line when it is the file Node.js started, which `isMain()` decides. `import.meta.main` is not available at the Node.js 22.18 floor.

## Exit codes and errors

`main()` in `runtime.ts` wraps every entry point:

| Exit code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | A refusal or a failure. The message is one line on standard error, without a stack trace. |
| `2` | Node.js is older than 22.18. |

A refusal is thrown as an `Error` with a message that says what to do, such as `--name is required.`.

## Options

`parseOptions` uses `node:util` `parseArgs` in strict mode, so an unknown option or a positional argument is an error. Helpers in `options.ts`:

- `requiredOption` refuses a missing or blank value.
- `listOption` reads a repeatable option that also takes comma-separated values, so `--topics a,b --topics c` gives three topics.
- `choiceOption` matches a value against a fixed list, ignoring case, and lists the choices when it does not match.

## Running commands

`run` always passes arguments directly to the program, with no shell. Text from the user, such as a description or a path, can never become shell syntax. It returns the exit code, the captured output, and whether the program was found at all.

`runShell` is the one exception. It runs the fixed command lines of the language table, such as `npm test`, which need a shell to find `npm.cmd` and the like on Windows. Those lines never contain user text.

`findExecutable` searches `PATH` the way the platform does, including `.exe`, `.cmd` and `.bat` on Windows. `assertCommandAvailable` in `project.ts` uses it to refuse early, with an install hint, when `git` or `tofu` is missing.

## Writing files

`writeProjectFile(projectPath, relativePath, content)` creates any missing folders, then writes the content as UTF-8 without a byte order mark, with CRLF turned into LF and exactly one trailing newline. It skips a file that already exists, with a warning, unless `force` is set.

`repositoryYaml` in `yaml.ts` writes definitions by hand, with no YAML library. Every string is single-quoted, so a topic such as `yes` or `1.0` stays a string. Topics are lowercased, empty lists are left out, and `auto_init: false` is written only for a repository published from a folder. See [Repository definitions](04-repository-definitions.md).

## Starters

`starters/index.ts` maps a language to its starter:

```typescript
export type Starter = (log: Log, projectPath: string, projectName: string) => void;

export const starters: Partial<Record<Language, Starter>> = {
  node: nodeStarter,
};
```

A language without an entry gets only the common files and its commands. To add a starter, see [Generated projects](11-generated-projects.md#adding-a-starter).
