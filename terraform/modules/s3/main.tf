# 1. 문서/성적표 버킷 (보안 및 보관 중심)
resource "aws_s3_bucket" "documents" {
  bucket = "${var.project_name}-${var.env}-lms-documents"
  tags   = { Name = "${var.project_name}-${var.env}-lms-documents" }
}

# 버전 관리 (실수 삭제 방지)
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration {
    status = "Enabled"
  }
}

# 기본 암호화 (SSE-S3)
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# 수명 주기 정책 (비용 최적화)
resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "archive_old_documents"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER_IR"
    }

    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
  }
}

# 2. 유저 아이콘 버킷 (성능 및 비용 중심)
resource "aws_s3_bucket" "icons" {
  bucket = "${var.project_name}-${var.env}-lms-user-icons"
  tags   = { Name = "${var.project_name}-${var.env}-lms-user-icons" }
}

# Intelligent-Tiering 수명 주기 정책
resource "aws_s3_bucket_lifecycle_configuration" "icons" {
  bucket = aws_s3_bucket.icons.id

  rule {
    id     = "intelligent_tiering"
    status = "Enabled"

    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
  }
}

# CORS 설정
resource "aws_s3_bucket_cors_configuration" "icons" {
  bucket = aws_s3_bucket.icons.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = [var.frontend_origin]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# 3. 공통 보안 설정 (퍼블릭 액세스 차단)
resource "aws_s3_account_public_access_block" "global" {
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "icons" {
  bucket = aws_s3_bucket.icons.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
