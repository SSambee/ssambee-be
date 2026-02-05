#!/bin/bash
set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 포트 정의
BLUE_PORT=4000
GREEN_PORT=4001

echo -e "${BLUE}=== 무중단 배포 시작 ===${NC}"

# .env 파일 경로를 스크립트 위치 기준으로 절대 경로화
ENV_PATH="./.env"

# 환경 변수 로드
if [ -f "$ENV_PATH" ]; then
    echo -e "${YELLOW}.env 파일 로드 중... ${NC}"
    
    # (CRLF) 문제 해결: 파일이 있으면 실행
    sed -i 's/\r$//' "$ENV_PATH"
    
    # [수정] 더 안정적인 변수 로드 방식 (set -a 사용)
    set -a
    . "$ENV_PATH"  # source 대신 . 을 사용하여 호환성 확보
    set +a
    echo -e "${GREEN}.env 파일 로드 성공!${NC}"
else
    echo -e "${RED}경고: .env 파일을 찾을 수 없습니다! $(pwd) ${NC}"
    ls -al
    exit 1
fi

# 환경 변수 확인 (!)
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}경고: DATABASE_URL이 로드되지 않았습니다! .env 파일을 확인하세요.${NC}"
    # DATABASE_URL이 로드되지 않은 경우, 파일 내용은 있는데 변수명이 틀렸는지 확인하기 위해 출력
    if grep -q "^DATABASE_URL=" "$ENV_PATH"; then
        echo -e "${RED}DATABASE_URL 키가 파일에 존재하지만 로드 실패${NC}"
    else
        echo -e "${RED}DATABASE_URL 키가 파일에 없습니다.${NC}"
    fi
    exit 1
fi

# 현재 실행 중인 컨테이너 확인
BLUE_RUNNING=$(docker ps -q -f name=eduops-backend-blue -f status=running)
GREEN_RUNNING=$(docker ps -q -f name=eduops-backend-green -f status=running)

# 새 컨테이너 시작
if [ -n "$BLUE_RUNNING" ]; then
    CURRENT="blue"
    TARGET="green"
    TARGET_PORT=$GREEN_PORT
    OLD_CONTAINER="eduops-backend-blue"
    NEW_CONTAINER="eduops-backend-green"
    OLD_SERVICE="backend-blue"
    NEW_SERVICE="backend-green"
elif [ -n "$GREEN_RUNNING" ]; then
    CURRENT="green"
    TARGET="blue"
    TARGET_PORT=$BLUE_PORT
    OLD_CONTAINER="eduops-backend-green"
    NEW_CONTAINER="eduops-backend-blue"
    OLD_SERVICE="backend-green"
    NEW_SERVICE="backend-blue"
else
    CURRENT="none"
    TARGET="blue"
    TARGET_PORT=$BLUE_PORT
    NEW_CONTAINER="eduops-backend-blue"
    NEW_SERVICE="backend-blue"
fi

# 디스크 공간 확보 (중요: t3.micro 용량 부족 방지)
echo -e "${YELLOW}사용하지 않는 이미지 및 컨테이너 정리 중...${NC}"
# 이미지는 건드리지 않고 멈춘 컨테이너만 삭제 (데이터 볼륨은 보호됨)
docker system prune -f

# Docker Compose 명령어 확인 및 설치 (Amazon Linux 2023 대응)
if docker compose version > /dev/null 2>&1; then
    COMPOSE="docker compose"
elif docker-compose version > /dev/null 2>&1; then
    COMPOSE="docker-compose"
else
    echo -e "${YELLOW}Docker Compose를 찾을 수 없습니다. 설치를 시도합니다...${NC}"
    # Docker Compose V2 바이너리 다운로드 (linux-x86_64)
    mkdir -p ~/.docker/cli-plugins
    curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o ~/.docker/cli-plugins/docker-compose
    chmod +x ~/.docker/cli-plugins/docker-compose
    COMPOSE="docker compose"
fi

# 새 컨테이너 시작
echo -e "${YELLOW}[$TARGET] 컨테이너 시작 중...${NC}"

if [ "$TARGET" = "green" ]; then
    $COMPOSE --profile green up -d backend-green nginx
else
    $COMPOSE --profile blue up -d backend-blue nginx
fi

# 컨테이너 실행 대기
echo -e "${YELLOW}[$TARGET] 컨테이너 실행 대기 중...${NC}"
RETRY_COUNT=0
MAX_RETRIES=12
CONTAINER_READY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    sleep 5
    CONTAINER_STATUS=$(docker ps -q -f name=$NEW_CONTAINER -f status=running)
    
    if [ -n "$CONTAINER_STATUS" ]; then
        echo -e "${GREEN}[$TARGET] 컨테이너 실행 완료!${NC}"
        CONTAINER_READY=true
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -e "${YELLOW}[$TARGET] 컨테이너 실행 대기 중... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}[$TARGET] 컨테이너 실행 실패!${NC}"
        $COMPOSE logs $NEW_SERVICE
        $COMPOSE stop $NEW_SERVICE
        exit 1
    fi
done

# Prisma 마이그레이션 (새 컨테이너)
if [ "$CONTAINER_READY" = true ]; then
    echo -e "${YELLOW}[$TARGET] 환경에 Prisma 마이그레이션 실행 중...${NC}"
    
    CLEAN_DATABASE_URL=$(echo "$DATABASE_URL" | tr -d '\r' | xargs)

    if docker exec -e DATABASE_URL="$CLEAN_DATABASE_URL" $NEW_CONTAINER pnpm prisma migrate deploy; then
        echo -e "${GREEN}[$TARGET] 환경 Prisma 마이그레이션 성공!${NC}"
    else
        echo -e "${RED}[$TARGET] 환경 Prisma 마이그레이션 실패!${NC}"
        echo -e "${RED}새 컨테이너를 중지합니다.${NC}"
        $COMPOSE stop $NEW_SERVICE
        exit 1
    fi
fi


# 헬스체크 대기 (실패 시 즉시 롤백)
echo -e "${YELLOW}[$TARGET] 헬스체크 대기 중 (최대 60초)...${NC}"
RETRY_COUNT=0
MAX_RETRIES=12
HEALTH_CHECK_FAILED=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    sleep 5
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$TARGET_PORT/health || echo "000")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        echo -e "${GREEN}[$TARGET] 헬스체크 성공! (HTTP $HEALTH_STATUS)${NC}"
        break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -e "${YELLOW}[$TARGET] 헬스체크 대기 중... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
    
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo -e "${RED}[$TARGET] 헬스체크 실패!${NC}"
        HEALTH_CHECK_FAILED=true
        break
    fi
done

# 헬스체크 실패 시 롤백
if [ "$HEALTH_CHECK_FAILED" = true ]; then
    echo -e "${RED}[$TARGET] 헬스체크 실패! 즉시 롤백합니다.${NC}"
    
    # 새 컨테이너 로그 확인
    echo -e "${YELLOW}[$TARGET] 컨테이너 로그:${NC}"
    $COMPOSE logs $NEW_SERVICE
    
    # 새 컨테이너 중지
    echo -e "${YELLOW}[$TARGET] 컨테이너 중지 중...${NC}"
    $COMPOSE stop $NEW_SERVICE
    
    # 컨테이너 삭제 (리소스 확보)
    echo -e "${YELLOW}[$TARGET] 컨테이너 삭제 중...${NC}"
    $COMPOSE rm -f $NEW_SERVICE
    
    # Nginx 설정 원복 (이전 환경이 있었을 경우에만)
    if [ "$CURRENT" != "none" ]; then
        echo -e "${YELLOW}Nginx [$CURRENT] 설정 원복 중...${NC}"

 if [ "$CURRENT" = "blue" ]; then
            # Blue를 살리고 Green을 주석처리
            sed -i "s|^[[:space:]]*#server eduops-backend-blue:4000;|    server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
            sed -i "s|^[[:space:]]*server eduops-backend-green:4000;|    #server eduops-backend-green:4000;|" nginx/conf.d/default.conf
        else
            # Green을 살리고 Blue를 주석처리
            sed -i "s|^[[:space:]]*#server eduops-backend-green:4000;|    server eduops-backend-green:4000;|" nginx/conf.d/default.conf
            sed -i "s|^[[:space:]]*server eduops-backend-blue:4000;|    #server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
        fi

        $COMPOSE exec -T nginx nginx -s reload
        echo -e "${GREEN}Nginx 설정 원복 완료!${NC}"
    fi
    
    echo -e "${RED}배포 중단 및 롤백 완료!${NC}"
    exit 1
fi

# Nginx 설정 전환
echo -e "${YELLOW}Nginx 설정을 [$TARGET]으로 전환합니다...${NC}"

# 1. TARGET이 green일 때 (전환 로직)
if [ "$TARGET" = "green" ]; then
    # blue 주석 처리, green 주석 해제 (항상 내부 포트 4000 사용)
    sed -i "s|^[[:space:]]*server eduops-backend-blue:[0-9]*;|    #server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
    sed -i "s|^[[:space:]]*#server eduops-backend-green:[0-9]*;|    server eduops-backend-green:4000;|" nginx/conf.d/default.conf
else
    # green 주석 처리, blue 주석 해제
    sed -i "s|^[[:space:]]*server eduops-backend-green:[0-9]*;|    #server eduops-backend-green:4000;|" nginx/conf.d/default.conf
    sed -i "s|^[[:space:]]*#server eduops-backend-blue:[0-9]*;|    server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
fi 

# Nginx 설정 검증 및 리로드
echo -e "${YELLOW}Nginx 설정 검증 중...${NC}"

if ! $COMPOSE ps nginx | grep -q "Up"; then
    echo -e "${YELLOW}Nginx 컨테이너가 실행 중이지 않습니다. 강제 시작합니다...${NC}"
    $COMPOSE up -d nginx
    sleep 3
fi

if $COMPOSE exec -T nginx nginx -t; then
    echo -e "${GREEN}Nginx 설정 검증 성공!${NC}"
    $COMPOSE exec -T nginx nginx -s reload
    echo -e "${GREEN}Nginx 설정 리로드 완료!${NC}"
else
    echo -e "${RED}Nginx 설정 검증 실패! 롤백합니다.${NC}"
    
    # Nginx 설정 원복
    if [ "$CURRENT" != "none" ]; then
        if [ "$CURRENT" = "blue" ]; then
            # [수정] 패턴을 eduops- 접두사와 포트 4000으로 통일
            sed -i "s|^[[:space:]]*#server eduops-backend-blue:4000;|    server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
            sed -i "s|^[[:space:]]*server eduops-backend-green:4000;|    #server eduops-backend-green:4000;|" nginx/conf.d/default.conf
        else
            sed -i "s|^[[:space:]]*#server eduops-backend-green:4000;|    server eduops-backend-green:4000;|" nginx/conf.d/default.conf
            sed -i "s|^[[:space:]]*server eduops-backend-blue:4000;|    #server eduops-backend-blue:4000;|" nginx/conf.d/default.conf
        fi
        $COMPOSE exec -T nginx nginx -s reload
    fi
    
    # 새 컨테이너 중지
    $COMPOSE stop $NEW_SERVICE
    $COMPOSE rm -f $NEW_SERVICE
    
    exit 1
fi

# 이전 컨테이너 중지
if [ "$CURRENT" != "none" ]; then
    echo -e "${YELLOW}5초 후 [$CURRENT] 컨테이너를 중지합니다...${NC}"
    sleep 5
    
    echo -e "${YELLOW}[$CURRENT] 컨테이너 중지 중...${NC}"
    $COMPOSE stop $OLD_SERVICE
    
    # 컨테이너 삭제 (리소스 확보)
    echo -e "${YELLOW}[$CURRENT] 컨테이너 삭제 중...${NC}"
    $COMPOSE rm -f $OLD_SERVICE
    
    echo -e "${GREEN}[$CURRENT] 컨테이너 중지 및 정리 완료${NC}"
fi

# 최종 확인
echo -e "${YELLOW}최종 상태 확인 중...${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 최종 헬스체크
FINAL_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$TARGET_PORT/health || echo "000")
if [ "$FINAL_HEALTH" = "200" ]; then
    echo -e "${GREEN}최종 헬스체크 성공!${NC}"
else
    echo -e "${RED}최종 헬스체크 실패!${NC}"
    exit 1
fi

echo -e "${GREEN}=== 무중단 배포 완료! ===${NC}"
echo -e "${GREEN}현재 활성 완료: $TARGET${NC}"
echo -e "${GREEN}Prisma 마이그레이션: 완료${NC}"

