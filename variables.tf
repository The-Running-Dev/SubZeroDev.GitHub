variable "owner" {
  description = "GitHub account that owns every managed repository."
  type        = string
  default     = "The-Running-Dev"
}

variable "state_passphrase" {
  description = "Passphrase for state and plan encryption. Set TF_VAR_state_passphrase."
  type        = string

  validation {
    condition     = length(var.state_passphrase) >= 16
    error_message = "state_passphrase must be at least 16 characters."
  }
}

variable "bootstrap_repositories" {
  description = "Repositories whose ruleset is temporarily disabled so an existing local history can be pushed."
  type        = list(string)
  default     = []
  nullable    = false
}
