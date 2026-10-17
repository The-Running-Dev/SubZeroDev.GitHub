resource "github_repository" "this" {
  name         = var.name
  description  = var.description
  homepage_url = var.homepage_url
  visibility   = var.visibility
  topics       = var.topics
  auto_init    = var.auto_init

  has_issues      = true
  has_projects    = true
  has_wiki        = true
  has_discussions = true

  allow_merge_commit     = false
  allow_squash_merge     = true
  allow_rebase_merge     = true
  allow_auto_merge       = true
  allow_update_branch    = true
  delete_branch_on_merge = true

  # merge_commit_title/message are left unmanaged: with merge commits disabled,
  # GitHub resets them on every update, so setting them is a permanent diff.
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "COMMIT_MESSAGES"

  web_commit_signoff_required = false

  # Removing a repository's YAML archives it on GitHub; nothing is ever deleted.
  archive_on_destroy = true
}

resource "github_repository_ruleset" "main" {
  name        = "Main"
  repository  = github_repository.this.name
  target      = "branch"
  enforcement = var.enforcement

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    deletion         = true
    non_fast_forward = true

    pull_request {
      allowed_merge_methods             = ["squash", "rebase"]
      dismiss_stale_reviews_on_push     = true
      require_code_owner_review         = false
      require_last_push_approval        = false
      required_approving_review_count   = 0
      required_review_thread_resolution = true
    }

    dynamic "required_status_checks" {
      for_each = length(var.required_checks) > 0 ? [1] : []

      content {
        strict_required_status_checks_policy = false
        do_not_enforce_on_create             = false

        dynamic "required_check" {
          for_each = var.required_checks

          content {
            context        = required_check.value.context
            integration_id = required_check.value.integration_id
          }
        }
      }
    }
  }
}
