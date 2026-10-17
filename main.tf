# One file per repository in repositories/<name>.yaml. Every key is optional;
# anything left out (or an empty file) takes the standard from modules/repository.
locals {
  repositories = {
    for file_name in fileset("${path.module}/repositories", "*.yaml") :
    trimsuffix(file_name, ".yaml") => (
      trimspace(file("${path.module}/repositories/${file_name}")) == ""
      ? null
      : yamldecode(file("${path.module}/repositories/${file_name}"))
    )
  }
}

module "repository" {
  source   = "./modules/repository"
  for_each = local.repositories

  name            = each.key
  description     = try(each.value.description, null)
  homepage_url    = try(each.value.homepage_url, null)
  visibility      = try(each.value.visibility, null)
  topics          = try(each.value.topics, null)
  auto_init       = try(each.value.auto_init, null)
  required_checks = try(each.value.required_checks, null)
  enforcement     = contains(var.bootstrap_repositories, each.key) ? "disabled" : "active"
}
