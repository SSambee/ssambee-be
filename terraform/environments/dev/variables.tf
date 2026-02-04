variable "env" {
  description = "배포 환경 (dev, prod 등)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "db_password" {
  description = "RDS PostgreSQL 마스터 비밀번호"
  type        = string
  sensitive   = true
}

variable "rds_deletion_protection" {
  description = "RDS 삭제 방지 활성 여부 (운영 환경은 true 권장)"
  type        = bool
  default     = true # 기본적으로  삭제 못하게 방어
}

variable "rds_skip_final_snapshot" {
  description = "RDS 삭제 시 최종 스냅샷 생성 건너뛰기 여부 (운영 환경은 false 권장)"
  type        = bool
  default     = false # 기본적으로 마지막 백업을 남기도록 설정
}

variable "environment" {
  description = "배포 환경 (development, production 등)"
  type        = string
}

variable "project_name" {
  description = "프로젝트 이름"
  type        = string
  default     = "ssambee"
}

variable "frontend_origin" {
  description = "프론트엔드 URL (CORS 및 리다이렉트 용)"
  type        = string
}

variable "github_pat" {
  description = "GitHub Personal Access Token for Runner Registration"
  type = string
  sensitive = true
}

variable "domain_name" {
  description = "Route53  에서 관리할 도메인 이름"
  type = string
  default = "ssambee.com"
}