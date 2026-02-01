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
