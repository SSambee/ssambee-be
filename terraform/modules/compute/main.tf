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
  iam_instance_profile        = var.iam_instance_profile

  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
  }

  lifecycle {
    # 실수로라도 테라폼이 이 서버를 삭제하는 것을 막는다.
    prevent_destroy = true
    # AMI 변경 등 교체가 불필요한 상황이면 새 서버를 먼저 다 띄우고 (Runner 등록 까지 완료) 예전 서버를 죽이게 한다.
    create_before_destroy = true
    # 콘솔에서 태그를 바꿨다고 서버를 재시작하면 곤란하니 태그 변화는 무시
    ignore_changes = [ tags, user_data ]
  }

  user_data = <<-EOF
                #!/bin/bash
                # 에러 발생 시 즉시 중단, 미선언 변수 사용 시 중단, 파이프라인 에러 감지
                set -euo pipefail
                
                # Swap & 기초 패키지 메모리 설정 (2GB) 도커등 설치
                fallocate -l 2G /swapfile
                chmod 600 /swapfile
                mkswap /swapfile
                swapon /swapfile
                echo '/swapfile none swap sw 0 0' >> /etc/fstab

                dnf update -y
                dnf install -y docker git jq libicu postgresql15
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

                # GITHUB CLI 설치 (Amazon Linux 2023 AMI)
                dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
                dnf install -y gh

                # Terraform 바이너리 설치
                dnf install -y yum-utils
                dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
                dnf install -y terraform

                #  Runner 설치 및 자동 등록
                export GH_TOKEN=$(aws ssm get-parameter --name "/github/pat" --with-decryption --query "Parameter.Value" --output text)
                REPO_OWNER="EduOps-Lab"
                REPO_NAME="ssambee-be"
                # Runner용 폴더 생성 (ec2-user 권한으로)
                mkdir -p /home/ec2-user/actions-runner  && cd /home/ec2-user/actions-runner
                # 최신 등록 토큰 발급 (실시간)
                RUNNER_TOKEN=$(gh api --method POST repos/$${REPO_OWNER}/$${REPO_NAME}/actions/runners/registration-token | jq -r '.token')
                # Runner 패키지 다운 (버전은 주기적 업데이트 필요)
                RUNNER_VERSION="2.331.0"
                curl -o actions-runner-linux-x64-$${RUNNER_VERSION}.tar.gz -L https://github.com/actions/runner/releases/download/v$${RUNNER_VERSION}/actions-runner-linux-x64-$${RUNNER_VERSION}.tar.gz
                tar xzf ./actions-runner-linux-x64-$${RUNNER_VERSION}.tar.gz
                # Runner 구성 및 서비스 등록 (ec2-user 소유권을 준수하면서)
                chown -R ec2-user:ec2-user /home/ec2-user/actions-runner
                sudo -u ec2-user ./config.sh --url https://github.com/$${REPO_OWNER}/$${REPO_NAME} --token $${RUNNER_TOKEN} --unattended --replace
                # 시스템 서비스로 등록하여 재부팅 시에도 자동 실행
                sudo ./svc.sh install
                sudo ./svc.sh start

                # Sparse  Checkout 설정
                cd /home/ec2-user
                mkdir -p app && cd app
                git init
                git remote add origin https://oauth2:$${GH_TOKEN}@github.com/$${REPO_OWNER}/$${REPO_NAME}.git
                git config core.sparseCheckout true
                echo "docker-compose.yml" >> .git/info/sparse-checkout
                echo "deploy.sh" >> .git/info/sparse-checkout
                echo "nginx/" >> .git/info/sparse-checkout
                git pull origin main
                # 토큰이 포함된 URL을 일반 URL로 교체
                git remote set-url origin https://github.com/$${REPO_OWNER}/$${REPO_NAME}.git
                chown -R ec2-user:ec2-user /home/ec2-user/app
                EOF
  tags = { Name = "${var.env}-app-server" }
}

resource "aws_eip" "app_eip" {
  instance = aws_instance.app_server.id
  domain   = "vpc"
  tags     = { Name = "${var.env}-app-eip" }
}