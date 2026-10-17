output "repositories" {
  description = "Managed repositories, keyed by name."
  value = {
    for name, repository in module.repository : name => {
      html_url       = repository.html_url
      http_clone_url = repository.http_clone_url
      ruleset_id     = repository.ruleset_id
    }
  }
}
