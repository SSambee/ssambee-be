# IAM Module Placeholder
# Roles and Policies can be defined here.
# aws_iam_user.imported_users["dev-member-Lee"]:
variable "iam_users" {
  description = "가져온 IAM 유저 정보"
  type = map(object({
    path = string
    tags = map(string)
  }))
  default = {
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

resource "aws_iam_user" "imported_users" {
  for_each = var.iam_users

  name = each.key
  path = each.value.path
  tags = each.value.tags

  # arn, unique_id 등은 테라폼이 자동으로 관리 코드에서 제외
}
