variable "env" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "public_subnet_id" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "key_name" {
  type    = string
  default = "lms-key"
}

variable "iam_instance_profile" {
  description = "IAM Instance Profile name to attach to the EC2 instance"
  type        = string
  default     = null
}
