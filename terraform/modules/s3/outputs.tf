output "documents_bucket_name" {
  value = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  value = aws_s3_bucket.documents.arn
}

output "icons_bucket_name" {
  value = aws_s3_bucket.icons.id
}

output "icons_bucket_arn" {
  value = aws_s3_bucket.icons.arn
}
