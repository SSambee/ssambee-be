resource "aws_db_subnet_group" "lms_db_sn_group" {
  name       = "${var.env}-db-subnet-group"
  subnet_ids = var.private_subnet_ids
  tags       = { Name = "${var.env}-db-sn-group" }
}

resource "aws_security_group" "rds_sg" {
  name   = "${var.env}-rds-sg"
  vpc_id = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_sg_id]
    description     = "Allow PostgreSQL from EC2"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.env}-rds-sg" }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.env}-postgres"
  engine         = "postgres"
  engine_version = "17.6"
  instance_class = "db.t3.micro"

  multi_az               = false
  availability_zone      = "${var.region}a"
  db_subnet_group_name   = aws_db_subnet_group.lms_db_sn_group.name
  vpc_security_group_ids = [aws_security_group.rds_sg.id]

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "eduops_db"
  username = "eduops"
  password = var.db_password

  publicly_accessible = false
  deletion_protection = var.rds_deletion_protection
  skip_final_snapshot = var.rds_skip_final_snapshot

  tags = { Name = "${var.env}-postgres" }
}
