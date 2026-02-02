variable "env" {
  description = "Execution environment (e.g., dev, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name for unique naming"
  type        = string
}

variable "frontend_origin" {
  description = "Frontend origin URL for CORS (optional)"
  type        = string
  # default가 없으므로 명시적인 입력을 강제(for FE URL)
  # 아니면 tfvars에서 설정
}
