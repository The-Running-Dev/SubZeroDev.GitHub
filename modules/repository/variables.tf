variable "name" {
  type = string
}

variable "description" {
  type     = string
  default  = ""
  nullable = false
}

variable "homepage_url" {
  type    = string
  default = null
}

variable "visibility" {
  type     = string
  default  = "public"
  nullable = false

  validation {
    condition     = contains(["public", "private"], var.visibility)
    error_message = "visibility must be public or private."
  }
}

variable "topics" {
  type     = list(string)
  default  = []
  nullable = false
}

variable "auto_init" {
  description = "Create the repository with an initial commit. False when an existing local history will be pushed."
  type        = bool
  default     = true
  nullable    = false
}

variable "required_checks" {
  description = "Status checks the default branch requires. integration_id pins the check to one app (15368 is GitHub Actions)."
  type = list(object({
    context        = string
    integration_id = optional(number)
  }))
  default  = []
  nullable = false
}

variable "enforcement" {
  type     = string
  default  = "active"
  nullable = false

  validation {
    condition     = contains(["active", "disabled"], var.enforcement)
    error_message = "enforcement must be active or disabled."
  }
}
