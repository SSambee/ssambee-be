#!/bin/bash
set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENV=$1
if [ -z "$ENV" ]; then
  ENV="dev"
fi

echo -e "${YELLOW}=== Docker Swarm 배포 시작 ($ENV) ===${NC}"

# 1. Docker Swarm 활성화 확인
if ! docker info | grep -q "Swarm: active"; then
  echo -e "${YELLOW}Docker Swarm 초기화 중...${NC}"
  # advertise-addr는 보통 eth0 또는 퍼블릭 IP를 사용
  docker swarm init --advertise-addr 127.0.0.1 || true
fi

# 2. .env 파일 로드 및 환경 변수 export (공백 포함 변수 안전하게 처리)
ENV_PATH="./.env"
if [ -f "$ENV_PATH" ]; then
    echo -e "${YELLOW}.env 파일 로드 중...${NC}"
    set -a
    # shellcheck disable=SC1090
    . "$ENV_PATH"
    set +a
    echo -e "${GREEN}.env 파일 로드 완료${NC}"
else
    echo -e "${RED}경고: .env 파일을 찾을 수 없습니다!${NC}"
    exit 1
fi

# 3. 배포 설정 준비
STACK_NAME="eduops"
COMPOSE_FILES="-c docker-compose.yml"

if [ "$ENV" == "prod" ]; then
    COMPOSE_FILES="$COMPOSE_FILES -c docker-compose.prod.yml"
else
    COMPOSE_FILES="$COMPOSE_FILES -c docker-compose.dev.yml"
fi

IMAGE=${GHCR_IMAGE:-ghcr.io/eduops-lab/ssambee-be:latest}

# 4. Prisma 마이그레이션 (배포 전 실행)
echo -e "${YELLOW}새 이미지 풀링 및 Prisma 마이그레이션 준비 중...${NC}"
docker pull "$IMAGE"

# 네트워크 확인 (없으면 생성 - migration용)
NETWORK_NAME="${STACK_NAME}_lms-network"
if ! docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
    docker network create --driver overlay --attachable "$NETWORK_NAME"
fi

echo -e "${YELLOW}Prisma 마이그레이션 실행 중...${NC}"
if docker run --rm \
    --network "$NETWORK_NAME" \
    -e DATABASE_URL="$DATABASE_URL" \
    "$IMAGE" \
    pnpm prisma migrate deploy; then
    echo -e "${GREEN}Prisma 마이그레이션 성공!${NC}"
else
    echo -e "${RED}Prisma 마이그레이션 실패! 배포를 중단합니다.${NC}"
    exit 1
fi

# 5. Docker Stack 배포
echo -e "${YELLOW}Stack ($STACK_NAME) 배포 중...${NC}"
docker stack deploy --with-registry-auth $COMPOSE_FILES $STACK_NAME

# 6. 상태 확인
echo -e "${YELLOW}배포 상태 확인...${NC}"
docker stack services $STACK_NAME

echo -e "${GREEN}=== 배포 완료! ===${NC}"
