---
title: Repository definitions
description: The repositories/<name>.yaml format, every key, its default, and how the scripts write it.
---

# Repository definitions

Each managed repository is one file, `repositories/<name>.yaml`. The file name, without `.yaml`, is the repository name on GitHub. `main.tf` reads every `*.yaml` file in the folder, so adding a file adds a repository and removing one archives it.

## Format

Every key is optional. An empty file is valid: the repository gets the [standard](03-repository-standard.md) with an empty description.

```yaml
description: 'Does a thing'
homepage_url: 'https://example.com'
visibility: public          # or private
topics:
  - typescript
  - tooling
required_checks:
  - context: 'build / Result'
    integration_id: 15368
auto_init: true             # false when an existing history will be pushed
```

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `description` | string | `''` | The repository description. |
| `homepage_url` | string | None | The website link shown on the repository page. |
| `visibility` | `public` or `private` | `public` | Any other value fails validation in the module. |
| `topics` | list of strings | None | GitHub topics. GitHub accepts only lowercase topics. |
| `required_checks` | list of `{context, integration_id}` | None | Status checks the default branch requires. `integration_id` is optional; 15368 is GitHub Actions. |
| `auto_init` | boolean | `true` | Whether GitHub creates an initial commit. Must be `false` when a local history will be pushed. |

A key that is left out falls back to the module's default. `main.tf` reads each key with `try(...)` and passes `null` for a missing one, and the module variables are non-nullable, so `null` becomes the default.

## Files the scripts write

`new-repository.ts` writes the definition through `scripts/lib/yaml.ts` rather than a YAML library:

- Every string is single-quoted, with any `'` doubled, so no value can turn into a number, a boolean or another YAML type.
- `description` and `visibility` are always written.
- Topics are lowercased.
- A `--required-check` of `context@id` becomes a `context` and a numeric `integration_id`. An id that is not a whole number is refused before anything is written.
- `auto_init: false` is added when the repository is published from an existing folder with `--path`.

For example, the definition of this repository:

```yaml
description: 'OpenTofu config that creates every The-Running-Dev repository with the standard settings and Main ruleset'
visibility: public
topics:
  - 'opentofu'
  - 'github'
  - 'infrastructure-as-code'
auto_init: false
```

`npm run test:tofu` checks that the YAML the scripts write decodes in OpenTofu to the intended values; see [Testing and CI](12-testing-and-ci.md).

## Editing a definition

Change the file, then plan and apply as described in [Day-to-day operations](10-operations.md#change-a-repository). The definition is the source of truth: a setting changed by hand on GitHub is reverted by the next apply.

`auto_init` only matters when the repository is created. Changing it on an existing repository has no effect on its history.
