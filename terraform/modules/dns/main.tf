# 기존 호스팅 영역
resource "aws_route53_zone" "main" {
    name = var.domain_name

    lifecycle {
        prevent_destroy = true # 실수로 삭제되는 것을 방지!
    }
}

# 백엔드 api 레코드
resource "aws_route53_record" "api" {
    zone_id = aws_route53_zone.main.zone_id
    name = "api.${var.domain_name}"
    type = "A"
    ttl = 300
    records = [var.public_ip] # EC2의 탄력적 IP
}

# 프론트 루트 도메인
resource "aws_route53_record" "vercel_root" {
    zone_id = aws_route53_zone.main.zone_id
    name = var.domain_name
    type = "A"
    ttl = 300
    records = ["216.198.79.1"]
}

# www Vercel CNAME
resource "aws_route53_record" "vercel_www" {
    zone_id = aws_route53_zone.main.zone_id
    name = "www.${var.domain_name}"
    type = "CNAME"
    ttl = 300
    records = ["4d963f6818915b24.vercel-dns-017.com."]
}