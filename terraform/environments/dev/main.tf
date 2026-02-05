provider "aws" {
  region = var.region
}

# MPL2.0 라이선스 해당 프로바이더 내부 소스 코드를 고친다면 공개의무 (근데 그럴일이 있을까?)
terraform {
  required_providers {
    postgresql = {
      source = "cyrilgdn/postgresql"
      version = "~> 1.25.0"
    }
  }
}

module "vpc" {
  source = "../../modules/vpc"

  env    = var.env
  region = var.region
}

module "compute" {
  source = "../../modules/compute"

  env                  = var.env
  vpc_id               = module.vpc.vpc_id
  public_subnet_id     = module.vpc.public_subnet_ids[0]
  instance_type        = "t3.micro"
  key_name             = "lms-key"
  iam_instance_profile = module.iam.instance_profile_name
}

module "database" {
  source = "../../modules/database"

  env                     = var.env
  region                  = var.region
  vpc_id                  = module.vpc.vpc_id
  private_subnet_ids      = module.vpc.private_subnet_ids
  app_sg_id               = module.compute.app_sg_id
  db_password             = var.db_password
  rds_deletion_protection = var.rds_deletion_protection
  rds_skip_final_snapshot = var.rds_skip_final_snapshot
  environment = var.environment
  app_db_username = var.app_db_username
  app_db_password = var.app_db_password
}

module "dns" {
  source = "../../modules/dns"
  domain_name = var.domain_name
  public_ip = module.compute.ec2_public_ip
}

import {
    to = module.dns.aws_route53_zone.main
    id = "Z03897078WHI3EBE3DTQ"
}

module "iam" {
  source = "../../modules/iam"
  env            = var.env
  s3_bucket_arns = [module.s3.documents_bucket_arn, module.s3.icons_bucket_arn]
  iam_users = {
    "dev-member-Lee" = {
      path = "/"
      tags = {}
    }
    "dev-member-Lim" = {
      path = "/"
      tags = {}
    }
    "dev-member-kim" = {
      path = "/"
      tags = {
        "Department" = "Devops" # 태그가 있다면 이렇게 기록
      }
    }
  }
}

module "s3" {
  source = "../../modules/s3"

  env             = var.env
  project_name    = var.project_name
  frontend_origin = var.frontend_origin
}

# Outputs
output "rds_endpoint" {
  description = "RDS PostgreSQL 엔드포인트"
  value       = module.database.rds_endpoint
}

output "ec2_public_ip" {
  description = "EC2 퍼블릭 IP"
  value       = module.compute.ec2_public_ip
}

import {
  to = module.dns.aws_route53_record.vercel_root
  id = "Z03897078WHI3EBE3DTQ_ssambee.com_A"
}

import {
  to = module.dns.aws_route53_record.vercel_www
  id = "Z03897078WHI3EBE3DTQ_www.ssambee.com_CNAME"
}

# 1. DB Subnet Group
import {
  to = module.database.aws_db_subnet_group.lms_db_sn_group
  id = "dev-db-subnet-group"
}

# 2. IAM Role
import {
  to = module.iam.aws_iam_role.ec2_s3_access_role
  id = "dev-ec2-s3-access-role"
}

# 3. IAM Users
import {
  to = module.iam.aws_iam_user.imported_users["dev-member-Lee"]
  id = "dev-member-Lee"
}
import {
  to = module.iam.aws_iam_user.imported_users["dev-member-Lim"]
  id = "dev-member-Lim"
}
import {
  to = module.iam.aws_iam_user.imported_users["dev-member-kim"]
  id = "dev-member-kim"
}

# 4. S3 Buckets
import {
  to = module.s3.aws_s3_bucket.documents
  id = "ssambee-dev-lms-documents"
}
import {
  to = module.s3.aws_s3_bucket.icons
  id = "ssambee-dev-lms-user-icons"
}