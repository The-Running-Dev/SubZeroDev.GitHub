---
title: OpenTofu configuration
description: The root module, its variables and outputs, the provider, the backend, and state and plan encryption.
---

# OpenTofu configuration

The configuration is small. The root module turns each definition file into one instance of `modules/repository`.

```text
.
├── versions.tf            OpenTofu and provider versions, the pg backend, state and plan encryption
├── providers.tf           The github provider, owned by var.owner
├── variables.tf           owner, state_passphrase, bootstrap_repositories
├── main.tf                One module instance per repositories/*.yaml
├── outputs.tf             The repositories output
├── repositories/          One definition per repository
└── modules/repository/    The standard: github_repository and the Main ruleset
```

## Versions

| Requirement | Value |
| --- | --- |
| OpenTofu | `>= 1.8` |
| `integrations/github` provider | `~> 6.13` |

`package-lock.json` pins the Node.js tooling. The provider version is resolved by `tofu init` within that range.

## Root module

`main.tf` builds a map from `fileset("repositories", "*.yaml")`, keyed by the file name without `.yaml`. A file that is empty, or only whitespace, maps to `null`, and every key then takes its default. Otherwise the file is read with `yamldecode`.

```hcl
module "repository" {
  source   = "./modules/repository"
  for_each = local.repositories

  name            = each.key
  description     = try(each.value.description, null)
  # … homepage_url, visibility, topics, auto_init, required_checks
  enforcement     = contains(var.bootstrap_repositories, each.key) ? "disabled" : "active"
}
```

Resource addresses follow the file name, for example `module.repository["SubZeroDev.Thing"].github_repository.this`. Renaming a definition file is therefore a remove plus an add, which archives the old repository and creates a new one. To rename a repository, use a `moved` block or `tofu state mv` instead.

## Variables

| Variable | Type | Default | Purpose |
| --- | --- | --- | --- |
| `owner` | string | `The-Running-Dev` | The account that owns every managed repository. |
| `state_passphrase` | string | None | Passphrase for state and plan encryption. Set `TF_VAR_state_passphrase`. Must be at least 16 characters. |
| `bootstrap_repositories` | list of strings | `[]` | Repositories whose ruleset is temporarily `disabled` so an existing history can be pushed. |

`bootstrap_repositories` is meant to be set only by `new-repository.ts --path`, through the environment of a single run. Leave it empty otherwise.

## Outputs

`repositories` is a map keyed by repository name:

| Field | Example |
| --- | --- |
| `html_url` | `https://github.com/The-Running-Dev/SubZeroDev.Thing` |
| `http_clone_url` | `https://github.com/The-Running-Dev/SubZeroDev.Thing.git` |
| `ruleset_id` | The numeric id of the `Main` ruleset. |

```bash
tofu output -json repositories
```

`new-repository.ts` reads `http_clone_url` from this output to add the `origin` remote. The `ruleset_id` is what an import of the ruleset needs; see [Day-to-day operations](10-operations.md#bring-an-existing-repository-under-management).

## Provider

```hcl
provider "github" {
  owner = var.owner
}
```

The provider reads its token from `GITHUB_TOKEN`. No token is stored in the configuration or the state.

## State and plan encryption

`versions.tf` configures client-side encryption for both the state and saved plans:

- **Key provider.** `pbkdf2` derives the key from `var.state_passphrase`.
- **Method.** `aes_gcm`.
- **Enforced.** OpenTofu refuses to read or write an unencrypted state or plan.

## Backend

The backend is `pg`, declared empty in `versions.tf`. Its connection string comes from `PG_CONN_STR` or the libpq `PG*` variables, so no address or password is in the configuration. The state is encrypted before it is written, so the database holds only ciphertext. Keep a backup of the database and the passphrase together; either one alone is useless. See [State database](02-getting-started.md#state-database).

Git ignores `.terraform/`, `*.tfstate`, `*.tfstate.*` and `*.tfplan`, which covers any local state left from before the move to PostgreSQL.
