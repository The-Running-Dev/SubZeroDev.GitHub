# The token comes from GITHUB_TOKEN; scripts/new-repository.ts fills it from `gh auth token`.
provider "github" {
  owner = var.owner
}
