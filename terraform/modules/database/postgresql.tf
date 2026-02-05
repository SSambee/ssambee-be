provider "postgresql" { 
    host     = aws_db_instance.postgres.address
    port     = 5432
    database = "eduops_db"
    username = aws_db_instance.postgres.username
    password = aws_db_instance.postgres.password    
    sslmode  = "require"
    connect_timeout = 15
}

terraform {
  required_providers {
    postgresql = {
      source = "cyrilgdn/postgresql"
      version = "~> 1.25.0"
    }
  }
}

# 서비스 전용 유저
resource "postgresql_role" "app_user" {
    name = var.app_db_username
    login = true
    password = var.app_db_password
}

# 데이터베이스 권한
resource "postgresql_grant" "db_access" {
    database = aws_db_instance.postgres.db_name
    role = postgresql_role.app_user.name
    object_type = "database"
    privileges = ["ALL"]
}

# 스키마 권한 부여
resource "postgresql_grant" "schema_access" {
    database = aws_db_instance.postgres.db_name
    role = postgresql_role.app_user.name
    schema = "public"
    object_type = "schema"
    privileges = ["USAGE", "CREATE"]
}

# DB 소유권 이전 (Migrate 권한을 말함)
resource "null_resource" "set_owner" {
    depends_on = [ postgresql_grant.db_access ]

    provisioner "local-exec" {
        command = "psql -h ${aws_db_instance.postgres.address} -p 5432 -U ${aws_db_instance.postgres.username} -d postgres -c 'ALTER DATABASE ${aws_db_instance.postgres.db_name} OWNER TO ${postgresql_role.app_user.name};'"
        environment = {
            PGPASSWORD = aws_db_instance.postgres.password
        }
    }
}