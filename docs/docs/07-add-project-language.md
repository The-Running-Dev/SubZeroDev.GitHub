---
title: Add a project language
description: Reference for scripts/add-project-language.ts, which adds the implementation language to a project scaffolded without one.
---

# Add a project language

A project scaffolded without `--language` has no starter files and no commands. Once the language is chosen, `scripts/add-project-language.ts` adds both:

```bash
node scripts/add-project-language.ts --path ../SubZeroDev.Thing --language node
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--path` | Required | The project folder. It must be the root of its Git repository. |
| `--language` | Required | `node`, `csharp`, `rust`, `java` or `go`. |
| `--name` | Folder name | Name passed to the starter for package and module names. |

## What it changes

- **Starter files.** The language's starter files are written wherever no file exists yet.
- **Commands sections.** The undecided section of `README.md` (`Commands`), `CLAUDE.md` (`Commands`) and `AGENTS.md` (`Essential Commands`) is replaced with the language's commands.
- **`.gitignore`.** The language's lines are appended, unless they are already there.

## Planned before anything is written

The script works out every change before it makes any of them:

1. The starter runs into a temporary folder. Each file it writes is compared with the project: a file that does not exist will be created, an identical one is skipped, and a different one is a conflict.
2. Each instruction file's commands section is checked. The section sits between `<!-- BEGIN project-commands -->` and `<!-- END project-commands -->` markers. It is replaced only while it is still exactly the undecided section that `new-project.ts` wrote. A missing file is skipped. A file whose section already lists these commands is left alone. Anything else is a conflict: the markers are gone, or the section was edited or lists other commands.
3. If there is any conflict, nothing is written, and the error lists each conflict:

   ```text
   Nothing was changed. Resolve each of these, then run again:
     - package.json already exists with different content
     - AGENTS.md has no undecided commands section to replace; it was edited, removed, or lists other commands
   ```

Running it again with the same language changes nothing and reports that the project already has the setup.

## Nothing is committed

The script never commits, so the branch and history stay as they are. Review the changes, install the dependencies and run the build and tests, then commit them through a pull request. The `Main` ruleset requires one anyway once the project is published.
