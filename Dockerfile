FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# 루트 설정 복사
COPY pnpm-lock.yaml package.json ./
COPY prisma ./prisma/

# frozen-lockfile로 보안 및 일관성 유지
RUN pnpm install --frozen-lockfile

# 소스 코드 복사
COPY  . .

# TS 빌드
RUN pnpm exec prisma generate
RUN pnpm run build 

# 프로덕션 이미지 빌드
FROM node:24-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# 빌드 결과물과 필요한 파일만 복사
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Prisma v7 setting file
COPY --from=builder /app/prisma.config.* ./
# Prisma 스키마 복사 (런타임에 필요)
COPY --from=builder /app/prisma ./prisma

# Husky 등 라이프사이클 스크립트 실행 방지
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Prisma CLI 실행 할 수 있도록 별도 설치
RUN pnpm add prisma -D

COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/src/generated ./src/generated

EXPOSE 4000

# 환경 변수는 docker-compose.yml 또는 runtime에 주입을 해준다.
CMD [ "pnpm", "start" ]