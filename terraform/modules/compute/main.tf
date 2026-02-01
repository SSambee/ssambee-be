# 내 현재 IP를 자동으로 가져오는 데이터 소스
data "http" "myip" {
  url = "https://ipv4.icanhazip.com"
}

# Amazon Linux 2023 AMI ID 가져오기
data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_security_group" "app_sg" {
  name   = "${var.env}-app-sg"
  vpc_id = var.vpc_id

  # 웹 서비스용 (누구나 접속 가능)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # SSH 접속 (내 IP만 허용)
  ingress {
    description = "Allow SSH from My IP"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${chomp(data.http.myip.response_body)}/32"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.env}-app-sg" }
}

resource "aws_instance" "app_server" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type

  root_block_device {
    volume_size           = 30
    volume_type           = "gp3"
    delete_on_termination = true
    tags                  = { Name = "${var.env}-root-vol" }
  }

  subnet_id              = var.public_subnet_id
  vpc_security_group_ids = [aws_security_group.app_sg.id]
  key_name               = var.key_name

  associate_public_ip_address = true

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }

  user_data = <<-EOF
                #!/bin/bash
                # 에러 발생 시 즉시 중단, 미선언 변수 사용 시 중단, 파이프라인 에러 감지
                set -euo pipefail
                
                # Swap 메모리 설정 (2GB)
                fallocate -l 2G /swapfile
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo '/swapfile none swap sw 0 0' >> /etc/fstab

                # 기초 패키지 설치
                dnf update -y
                dnf install -y docker
                systemctl start docker
                systemctl enable docker
                usermod -aG docker ec2-user

                # Docker Compose 설치
                mkdir -p /usr/local/lib/docker/cli-plugins/

                COMPOSE_VERSION="v2.40.3"
                COMPOSE_SHA256=dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372
                curl -fSL "https://github.com/docker/compose/releases/download/$${COMPOSE_VERSION}/docker-compose-linux-x86_64" -o /usr/local/lib/docker/cli-plugins/docker-compose
                echo "$${COMPOSE_SHA256} /usr/local/lib/docker/cli-plugins/docker-compose" | sha256sum -c -
                chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

                # 설치 확인
                docker compose version
                EOF

  tags = { Name = "${var.env}-app-server" }
}

resource "aws_eip" "app_eip" {
  instance = aws_instance.app_server.id
  domain   = "vpc"
  tags     = { Name = "${var.env}-app-eip" }
}
