variable "env" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "app_sg_id" {
  type = string
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "rds_deletion_protection" {
  type = bool
}

variable "rds_skip_final_snapshot" {
  type = bool
}
