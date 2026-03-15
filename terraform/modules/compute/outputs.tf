output "app_sg_id" {
  value = aws_security_group.app_sg.id
}

output "ec2_public_ip" {
  value = aws_eip.app_eip.public_ip
}
