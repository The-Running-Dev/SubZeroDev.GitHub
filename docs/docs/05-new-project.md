---
title: Create a project
description: Reference for scripts/new-project.ts, which scaffolds a project, commits it and publishes it as a managed repository.
---

# Create a project

`scripts/new-project.ts` goes from nothing to a published repository in one command. It scaffolds the project folder, initializes Git on `main`, commits the scaffold, and then runs [`new-repository.ts`](06-new-repository.md) with that folder.

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --language node --description 'Does a thing' --topics node,tooling
```

## What it does

1. **Checks first.** Before anything is written it checks that:
   - the name is valid;
   - Git is on `PATH`, and so is Graphify when `--graphify-hook` is given;
   - the project folder does not exist yet;
   - unless `--local-only` is given, OpenTofu is on `PATH`, `TF_VAR_state_passphrase` is at least 16 characters, and `repositories/<name>.yaml` does not exist.
2. **Writes the common files.** These are the same for every language; see [Generated projects](11-generated-projects.md).
3. **Initializes Git** on a `main` branch, with the optional commit identity for this repository only.
4. **Runs the language starter**, unless `--skip-language-starter` is given.
5. **Validates.** It runs the language's build and test commands. A failure is reported as a warning, with the install command to try, and does not stop the run.
6. **Builds the code graph** with `graphify update .` when Graphify is on `PATH`, and with `--graphify-hook` installs its rebuild hooks; see [Code graph](#code-graph).
7. **Commits** everything as `Initial project scaffold` on `main`.
8. **Publishes.** It calls `new-repository.ts` with `--path` set to the project folder. That creates the repository empty, pushes `main`, and switches the `Main` ruleset on.

`--local-only` stops after step 7. `--plan-only` runs steps 1 to 7, then shows the OpenTofu plan without applying it.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--name` | Required | Repository and project name. Letters, digits, `.`, `_` and `-` only. |
| `--language` | Undecided | `node`, `csharp`, `rust`, `java` or `go`. Leave it out to defer the choice. |
| `--path` | `../<name>` | Project folder. The default is a sibling of this repository. It must not exist. |
| `--description` | Empty | Repository description. |
| `--visibility` | `public` | `public` or `private`. |
| `--topics` | None | Topics. Repeat the option or separate values with commas. |
| `--required-check` | None | `context` or `context@integration_id`. Repeatable. |
| `--client` | `both` | Which assistant instructions to write: `both`, `claude-code` (`CLAUDE.md`) or `codex` (`AGENTS.md`). |
| `--git-user-name` | Global config | Commit author name, set in the new repository only. |
| `--git-user-email` | Global config | Commit author email, set in the new repository only. |
| `--skip-language-starter` | Off | Write the common files and commands, but no starter files. |
| `--skip-validation` | Off | Skip running the build and test commands. |
| `--graphify-hook` | Off | Also install Graphify's rebuild hooks. Requires Graphify on `PATH`. |
| `--local-only` | Off | Scaffold and commit, but do not create the GitHub repository. |
| `--plan-only` | Off | Scaffold and commit, then show the GitHub plan without applying it. |

Option values are case-insensitive for `--language`, `--visibility` and `--client`. Any unknown option, or a positional argument, is refused.

## Languages

| Language | Install | Build | Test | Lint | Run |
| --- | --- | --- | --- | --- | --- |
| `node` | `npm install` | `npm run build` | `npm test` | `npm run lint` | `npm start` |
| `csharp` | `dotnet restore` | `dotnet build` | `dotnet test` | `dotnet format --verify-no-changes` | `dotnet run --project src` |
| `rust` | `cargo fetch` | `cargo build --release` | `cargo test` | `cargo clippy --all-targets -- -D warnings` | `cargo run --release` |
| `java` | `mvn dependency:resolve` | `mvn package -DskipTests` | `mvn test` | `mvn checkstyle:check` | `java -jar target/app.jar` |
| `go` | `go mod download` | `go build -o bin/app .` | `go test ./...` | `go vet ./...` | `go run .` |

Every language has a starter, described in [Generated projects](11-generated-projects.md). Its commands are written into `README.md`, `CLAUDE.md` and `AGENTS.md`, and its `.gitignore` lines into `.gitignore`. Validation runs the build and test commands right after scaffolding, without the install step. `dotnet`, `cargo` and `mvn` fetch what they need as they build, and the Go starter has no dependencies, so those pass when the toolchain is installed. The Node starter needs `npm install` first, so its first validation reports a warning. That is expected; install the dependencies and run the commands yourself.

## Without a language

Leave out `--language` while the implementation language is undecided:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --local-only
```

The project gets the same common files, committed on `main`, but no starter and no validation. The commands sections of `README.md`, `CLAUDE.md` and `AGENTS.md` say that the language has not been selected yet, instead of listing commands. Publishing works the same way. When the language is chosen, add it with [`add-project-language.ts`](07-add-project-language.md).

## Code graph

When [Graphify](https://github.com/Graphify-Labs/graphify) is on `PATH`, the script runs `graphify update .` in the project after the starter and validation, and before the commit. That builds a code-only graph, with no LLM calls, into `graphify-out/`: `GRAPH_REPORT.md`, `graph.json` and `graph.html`. `.gitignore` keeps `graphify-out/` out of the repository, and `CLAUDE.md` and `AGENTS.md` tell the agent to read the report when it exists. Without Graphify the step is skipped with a note; run `graphify update .` in the project later. If the build fails, the script warns and still commits. On Windows, a missing-file error usually means a path under `graphify-out/` passed the 260-character limit, and the warning says so: move the project to a shorter path or enable Windows long paths, then run `graphify update .`.

With `--graphify-hook` the script also runs `graphify hook install`. It adds post-commit, post-checkout and post-merge hooks that rebuild the graph in the background, registers a merge driver for `graph.json` in the repository's local Git config, and appends `graphify-out/graph.json merge=graphify` to `.gitattributes`, which the initial commit includes.

Graphify is optional, so a failed build or hook install is a warning and the run goes on.

## Examples

Scaffold and publish a Node.js project:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --language node --description 'Does a thing'
```

Scaffold a C# project locally and publish it later:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --language csharp --local-only
node scripts/new-repository.ts --name SubZeroDev.Thing --path ../SubZeroDev.Thing
```

Preview the GitHub changes before committing to them:

```bash
node scripts/new-project.ts --name SubZeroDev.Thing --language node --plan-only
```

After `--plan-only`, the scaffold and its commit stay on disk, and the definition written for the plan is removed from `repositories/` again. Publish it with `new-repository.ts --path`.

## Errors

A refusal prints one line on stderr and exits with code 1. Common ones:

| Message | Cause |
| --- | --- |
| `<path> already exists. Choose another --path, or publish it with new-repository.ts --path.` | The project folder exists. |
| `repositories/<name>.yaml already exists; <name> is already managed here.` | A definition with that name exists. |
| `Set TF_VAR_state_passphrase (16+ characters) before running, or pass --local-only.` | The passphrase is missing or too short. |
| `'tofu' was not found. Install OpenTofu: …` | OpenTofu is not on `PATH`. |
| `'graphify' was not found. Install Graphify, or leave out --graphify-hook.` | `--graphify-hook` was given without Graphify on `PATH`. |
| `--language must be one of node, csharp, rust, java, go; got '<value>'.` | Unknown language. |
