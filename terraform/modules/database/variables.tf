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

variable "environment" {
  type = string
 }

//** App User **//
// 서비스 유저 정보를 변수로 관리
variable "app_db_username" {
  description = "Prisma/App에서 사용할 유저명" 
  type = string
  default = "eduops_user"
}

variable "app_db_password" {
  description = "Prisma/App에서 사용할 비밀번호" 
  type = string
  sensitive = true
}