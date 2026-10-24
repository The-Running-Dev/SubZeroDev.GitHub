# Run with `tofu test` (npm run test:tofu does). The provider is mocked, so
# nothing here talks to GitHub or needs a token.
mock_provider "github" {}

variables {
  state_passphrase = "tofu-test-passphrase"
}

run "every_yaml_file_becomes_a_repository" {
  command = plan

  assert {
    condition     = contains(keys(local.repositories), "SubZeroDev.GitHub")
    error_message = "repositories/SubZeroDev.GitHub.yaml was not picked up."
  }

  assert {
    condition = alltrue([
      for definition in values(local.repositories) :
      definition == null ? true : length(setsubtract(keys(definition), ["description", "homepage_url", "visibility", "topics", "required_checks", "auto_init"])) == 0
    ])
    error_message = "repositories/*.yaml may only use description, homepage_url, visibility, topics, required_checks and auto_init; any other key is silently ignored."
  }

  assert {
    condition     = length(module.repository) == length(local.repositories)
    error_message = "Every repositories/*.yaml file must produce one module.repository instance."
  }
}

run "managed_repository_ruleset_is_active" {
  command = plan

  assert {
    condition     = module.repository["SubZeroDev.GitHub"].enforcement == "active"
    error_message = "A repository outside bootstrap_repositories must have an active ruleset."
  }
}

run "bootstrap_disables_the_ruleset" {
  command = plan

  variables {
    bootstrap_repositories = ["SubZeroDev.GitHub"]
  }

  assert {
    condition     = module.repository["SubZeroDev.GitHub"].enforcement == "disabled"
    error_message = "A repository in bootstrap_repositories must have its ruleset disabled."
  }
}

run "short_passphrase_is_rejected" {
  command = plan

  variables {
    state_passphrase = "too-short"
  }

  expect_failures = [var.state_passphrase]
}