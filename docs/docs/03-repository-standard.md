---
title: The repository standard
description: Every setting and ruleset rule that modules/repository applies to each managed repository.
---

# The repository standard

`modules/repository` defines what every managed repository looks like. Each definition in `repositories/` becomes one instance of the module. The standard is set in this one place: no repository sets it differently, and nothing is set by hand in the GitHub UI.

## Repository settings

The `github_repository.this` resource sets the following.

### Features

| Setting | Value |
| --- | --- |
| Issues | On |
| Projects | On |
| Wiki | On |
| Discussions | On |

### Merging

| Setting | Value |
| --- | --- |
| Merge commits | Allowed. The title is the pull request title and the message is the pull request body. |
| Squash merges | Allowed. The title is the pull request title and the message lists the branch's commit messages. |
| Rebase merges | Allowed |
| Auto-merge | Allowed |
| Update branch button | On |
| Delete head branch on merge | On |
| Web commit sign-off | Not required |

### From the definition

| Setting | Default | Definition key |
| --- | --- | --- |
| Description | Empty | `description` |
| Homepage | None | `homepage_url` |
| Visibility | `public` | `visibility` (`public` or `private`) |
| Topics | None | `topics` |
| Initial commit | Created | `auto_init` |

See [Repository definitions](04-repository-definitions.md) for the file format.

### Archive on destroy

`archive_on_destroy = true`. When a definition is removed, the apply archives the repository on GitHub instead of deleting it. The history, issues and pull requests all stay; the repository becomes read-only and is no longer managed.

## The Main ruleset

Each repository gets one branch ruleset, `github_repository_ruleset.main`, named `Main`, and it targets the default branch (`~DEFAULT_BRANCH`).

| Rule | Effect |
| --- | --- |
| Restrict deletions | The default branch cannot be deleted. |
| Block force pushes | No non-fast-forward push to the default branch. |
| Require a pull request | Every change arrives through a pull request merged by merge, squash or rebase. |
| Required approvals | 0. A pull request does not need an approving review. |
| Dismiss stale reviews on push | On. A new push dismisses reviews given before it. |
| Require review thread resolution | On. Every review conversation must be resolved before merging. |
| Code owner review | Not required. |
| Approval of the last push | Not required. |
| Required status checks | Only when the definition lists `required_checks`. |

### Required status checks

When `required_checks` is not empty, the ruleset adds a required status checks rule. Each entry has a `context`, the check's name as GitHub reports it, and an optional `integration_id`, which pins the check to one GitHub App (15368 is GitHub Actions). The branch does not have to be up to date before merging (`strict_required_status_checks_policy = false`), and the checks also apply when the branch is created.

### Enforcement

The ruleset is `active` for every repository except those named in the `bootstrap_repositories` variable, where it is `disabled`. Disabling is only needed for a moment: it lets `new-repository.ts --path` push an existing local `main` before the pull request rule applies. See [Create a repository](06-new-repository.md#publish-an-existing-folder).

## Changing the standard

Edit `modules/repository/main.tf` and apply. Every repository in `repositories/` follows on the next `tofu apply`, so read the plan carefully: a single change appears once per repository.

```bash
export GITHUB_TOKEN="$(gh auth token)"
tofu plan -out=standard.tfplan
tofu apply standard.tfplan
```

The module's tests in `tests/module.tftest.hcl` describe the standard too. Update them in the same pull request; see [Testing and CI](12-testing-and-ci.md).
