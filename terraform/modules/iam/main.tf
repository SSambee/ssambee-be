# IAM Module Placeholder
# Roles and Policies can be defined here.
# aws_iam_user.imported_users["dev-member-Lee"]:
variable "iam_users" {
  description = "가져온 IAM 유저 정보"
  type = map(object({
    path = string
    tags = map(string)
  }))
  default = {}
}

variable "s3_bucket_arns" {
  description = "ARNs of the S3 buckets to allow access to"
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.s3_bucket_arns) > 0
    error_message = "최소 한 개의 S3 버킷 ARN이 제공되어야 합니다."
  }
}

variable "env" {
  description = "Environment name"
  type        = string
}

resource "aws_iam_user" "imported_users" {
  for_each = var.iam_users

  name = each.key
  path = each.value.path
  tags = each.value.tags

  # arn, unique_id 등은 테라폼이 자동으로 관리 코드에서 제외
}

# EC2용 IAM 역할 (S3 접근 권한 부여용)
resource "aws_iam_role" "ec2_s3_access_role" {
  name = "${var.env}-ec2-s3-access-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = { Name = "${var.env}-ec2-s3-access-role" }
}

# S3 접근 정책
resource "aws_iam_role_policy" "ec2_s3_policy" {
  name = "${var.env}-ec2-s3-policy"
  role = aws_iam_role.ec2_s3_access_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = flatten([
          for arn in var.s3_bucket_arns : [arn, "${arn}/*"]
        ])
      }
    ]
  })
}

# EC2에 부착할 Instance Profile
resource "aws_iam_instance_profile" "ec2_s3_profile" {
  name = "${var.env}-ec2-s3-profile"
  role = aws_iam_role.ec2_s3_access_role.name
}

output "instance_profile_name" {
  value = aws_iam_instance_profile.ec2_s3_profile.name
}
