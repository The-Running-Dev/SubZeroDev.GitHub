---
title: Getting started
description: Tools, credentials and the one-time setup needed before any script or tofu command runs.
---

# Getting started

Everything here runs from the root of this repository, on Windows, macOS or Linux.

## Tools

| Tool | Version | Used for |
| --- | --- | --- |
| Node.js | 22.18 or later | Runs the TypeScript scripts directly, with no build step. |
| npm | Bundled with Node.js | Installs the type definitions and the TypeScript compiler (`npm ci`). |
| Git | Any recent release | Initializes scaffolds and pushes an existing history. |
| OpenTofu | 1.8 or later | Plans and applies the configuration. See the [install guide](https://opentofu.org/docs/intro/install/). |
| GitHub CLI | Any recent release | Supplies the token (`gh auth token`) when `GITHUB_TOKEN` is not set. |

A script started on an older Node.js prints one line, `These scripts require Node >= 22.18; found <version>.`, and exits with code 2.

Install the development dependencies once:

```bash
npm ci
```

## Credentials

### State passphrase

The state file and every saved plan are encrypted with AES-GCM, using a key derived from a passphrase with PBKDF2. Encryption is enforced: OpenTofu refuses to write either one unencrypted. The passphrase must be at least 16 characters.

```bash
export TF_VAR_state_passphrase='<your passphrase>'
```

Keep the passphrase somewhere safe. Without it the state cannot be read, and OpenTofu no longer knows which repositories it manages.

### GitHub token

The `integrations/github` provider reads its token from `GITHUB_TOKEN`. The scripts fill it in from `gh auth token` when it is not already set, and they pass it to `tofu` only, so your shell's environment is left unchanged. For a `tofu` command you run yourself, export it first:

```bash
gh auth login
export GITHUB_TOKEN="$(gh auth token)"
```

The token needs permission to create and administer repositories under `The-Running-Dev`.

## Initialize OpenTofu

```bash
tofu init
tofu plan
```

The state is local: it is `terraform.tfstate` in the repository root, next to `terraform.tfstate.backup`. Git ignores both, and every `*.tfplan` file. Back up the state together with the passphrase. A plan with no changes means every repository on GitHub matches its definition.

## Next steps

- [Create a project](05-new-project.md) to scaffold, commit and publish a new repository in one command.
- [Create a repository](06-new-repository.md) to publish a folder that already exists, or to create a repository that has no scaffold.
- [Day-to-day operations](10-operations.md) covers changing, importing and archiving repositories.
