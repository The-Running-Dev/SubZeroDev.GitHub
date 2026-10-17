# The standard every repository gets, checked against modules/repository directly.
mock_provider "github" {}

variables {
  name = "Example.Repository"
}

run "standard_repository_settings" {
  command = plan

  module {
    source = "./modules/repository"
  }

  assert {
    condition = alltrue([
      github_repository.this.has_issues,
      github_repository.this.has_projects,
      github_repository.this.has_wiki,
      github_repository.this.has_discussions,
    ])
    error_message = "Issues, projects, wiki and discussions must all be on."
  }

  assert {
    condition = alltrue([
      github_repository.this.allow_merge_commit,
      github_repository.this.allow_squash_merge,
      github_repository.this.allow_rebase_merge,
      github_repository.this.allow_auto_merge,
      github_repository.this.allow_update_branch,
      github_repository.this.delete_branch_on_merge,
    ])
    error_message = "Merge, squash and rebase, auto-merge, update-branch and delete-on-merge must all be on."
  }

  assert {
    condition = (
      github_repository.this.squash_merge_commit_title == "PR_TITLE" &&
      github_repository.this.squash_merge_commit_message == "COMMIT_MESSAGES" &&
      github_repository.this.merge_commit_title == "PR_TITLE" &&
      github_repository.this.merge_commit_message == "PR_BODY"
    )
    error_message = "Merge and squash commit messages must use the pull request title and body."
  }

  assert {
    condition     = github_repository.this.archive_on_destroy
    error_message = "Removing a repository must archive it, never delete it."
  }

  assert {
    condition = (
      github_repository.this.visibility == "public" &&
      github_repository.this.auto_init &&
      github_repository.this.description == "" &&
      length(github_repository.this.topics) == 0
    )
    error_message = "Defaults must be public, auto-initialized, no description and no topics."
  }
}

run "standard_main_ruleset" {
  command = plan

  module {
    source = "./modules/repository"
  }

  assert {
    condition = (
      github_repository_ruleset.main.name == "Main" &&
      github_repository_ruleset.main.target == "branch" &&
      github_repository_ruleset.main.enforcement == "active"
    )
    error_message = "The ruleset must be an active branch ruleset named Main."
  }

  assert {
    condition     = github_repository_ruleset.main.conditions[0].ref_name[0].include == tolist(["~DEFAULT_BRANCH"])
    error_message = "The Main ruleset must target the default branch."
  }

  assert {
    condition = (
      github_repository_ruleset.main.rules[0].deletion &&
      github_repository_ruleset.main.rules[0].non_fast_forward
    )
    error_message = "The default branch must not be deletable or force-pushable."
  }

  assert {
    condition = (
      toset(github_repository_ruleset.main.rules[0].pull_request[0].allowed_merge_methods) == toset(["merge", "squash", "rebase"]) &&
      github_repository_ruleset.main.rules[0].pull_request[0].dismiss_stale_reviews_on_push &&
      github_repository_ruleset.main.rules[0].pull_request[0].required_review_thread_resolution &&
      github_repository_ruleset.main.rules[0].pull_request[0].required_approving_review_count == 0
    )
    error_message = "Changes must arrive by pull request: all merge methods, stale reviews dismissed, threads resolved, no approvals required."
  }

  assert {
    condition     = length(github_repository_ruleset.main.rules[0].required_status_checks) == 0
    error_message = "No required status checks unless required_checks is set."
  }
}

run "required_checks_become_required_status_checks" {
  command = plan

  module {
    source = "./modules/repository"
  }

  variables {
    required_checks = [
      { context = "build / Result", integration_id = 15368 },
      { context = "lint" },
    ]
  }

  assert {
    condition     = length(github_repository_ruleset.main.rules[0].required_status_checks[0].required_check) == 2
    error_message = "Each required_checks entry must become one required_check."
  }

  assert {
    condition = contains(
      [for check in github_repository_ruleset.main.rules[0].required_status_checks[0].required_check : "${check.context}@${coalesce(check.integration_id, 0)}"],
      "build / Result@15368"
    )
    error_message = "integration_id must be carried onto the required check."
  }
}

run "disabled_enforcement_is_passed_through" {
  command = plan

  module {
    source = "./modules/repository"
  }

  variables {
    enforcement = "disabled"
  }

  assert {
    condition     = github_repository_ruleset.main.enforcement == "disabled"
    error_message = "enforcement = disabled must reach the ruleset."
  }
}

run "invalid_visibility_is_rejected" {
  command = plan

  module {
    source = "./modules/repository"
  }

  variables {
    visibility = "internal"
  }

  expect_failures = [var.visibility]
}

run "invalid_enforcement_is_rejected" {
  command = plan

  module {
    source = "./modules/repository"
  }

  variables {
    enforcement = "evaluate"
  }

  expect_failures = [var.enforcement]
}
