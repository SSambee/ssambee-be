output "vpc_id" {
  value = aws_vpc.lms_vpc.id
}

output "public_subnet_ids" {
  value = [aws_subnet.public_subnet.id, aws_subnet.public_subnet_2.id]
}

output "private_subnet_ids" {
  value = [aws_subnet.private_subnet.id, aws_subnet.private_subnet_2.id]
}
