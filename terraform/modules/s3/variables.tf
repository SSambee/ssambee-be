variable "env" {
  description = "Execution environment (e.g., dev, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name for unique naming"
  type        = string
  default     = "ssambee"
}

variable "frontend_origin" {
  description = "Frontend origin URL for CORS (optional)"
  type        = string
  default     = "*"
}
