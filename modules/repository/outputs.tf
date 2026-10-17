output "html_url" {
  value = github_repository.this.html_url
}

output "http_clone_url" {
  value = github_repository.this.http_clone_url
}

output "ruleset_id" {
  value = github_repository_ruleset.main.ruleset_id
}

output "enforcement" {
  value = github_repository_ruleset.main.enforcement
}
