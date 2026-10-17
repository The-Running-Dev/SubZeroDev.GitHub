# The token comes from GITHUB_TOKEN; scripts/New-Repository.ps1 fills it from `gh auth token`.
provider "github" {
  owner = var.owner
}
