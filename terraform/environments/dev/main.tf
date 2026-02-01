provider "aws" {
  region = var.region
}

module "vpc" {
  source = "../../modules/vpc"

  env    = var.env
  region = var.region
}

module "compute" {
  source = "../../modules/compute"

  env              = var.env
  vpc_id           = module.vpc.vpc_id
  public_subnet_id = module.vpc.public_subnet_ids[0]
  instance_type    = "t3.micro"
  key_name         = "lms-key"
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
}

module "iam" {
  source = "../../modules/iam"
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
