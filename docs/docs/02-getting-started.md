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

### State database

The state lives in PostgreSQL, through OpenTofu's `pg` backend, so the [weekly drift check](12-testing-and-ci.md#drift-detection) can read it. The backend takes its connection string from `PG_CONN_STR`; the libpq variables (`PGHOST`, `PGUSER`, `PGPASSWORD` and the rest) work too.

```bash
export PG_CONN_STR='postgres://<user>:<password>@<host>/<database>?sslmode=require'
```

The state is encrypted before it leaves your machine, so the database only ever holds ciphertext. OpenTofu keeps it in the `terraform_remote_state` schema, which it creates on the first `tofu init`, and takes a PostgreSQL advisory lock for each command that writes state. The database must be reachable from GitHub's runners for the drift check to work.

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

`tofu init` connects to the state database. A plan with no changes means every repository on GitHub matches its definition. Git ignores every `*.tfplan` file, and any local `terraform.tfstate` left from before the move to PostgreSQL; see [Move the state to PostgreSQL](10-operations.md#move-the-state-to-postgresql). Back up the database together with the passphrase.

## Next steps

- [Create a project](05-new-project.md) to scaffold, commit and publish a new repository in one command.
- [Create a repository](06-new-repository.md) to publish a folder that already exists, or to create a repository that has no scaffold.
- [Day-to-day operations](10-operations.md) covers changing, importing and archiving repositories.
