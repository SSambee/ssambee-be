![SSam B Logo](assets/ssam-b-logo.png)

# SSam B 백엔드

이 레포는 **SSam B** 학원/수업 운영 플랫폼의 **백엔드 서버(Node.js)** 입니다.
Express 기반 REST API 서버로, 강사/조교/학생/학부모의 교육 운영 흐름을 하나의 API로 통합합니다.

## 핵심 역할

- 회원/권한/인증 기반 API 제공
- 수강 데이터(강의, 수강생, 성적, 과제, 출결, 게시글, 일정 등) 관리
- 파일 업로드/정적 자료 제공을 위한 스토리지 연동
- 알림/로그/모니터링 연동(선택 환경)
- 라우트/서비스/리포지토리 분리로 운영/확장성 확보

## 기술 스택

- Runtime: Node.js 24.x
- Language: TypeScript
- Framework: Express
- ORM: Prisma (PostgreSQL)
- Auth: Better Auth + 세션 쿠키 + auth 미들웨어
- Infra/Utilities:
  - PostgreSQL
  - Redis (선택)
  - AWS S3 / CloudFront (파일)
  - Sentry (에러 추적)
  - Nodemailer (SMTP 메일 발송)
  - Docker / Nginx

## 실행 구조

- 진입점: `src/app.ts`
- 서버 부팅 흐름:
  1. 환경 변수 로드 및 검증
  2. Sentry 초기화
  3. 보안 헤더/CORS 설정
  4. 파싱 미들웨어 및 라우터 등록
  5. 공통 에러 핸들러 등록
  6. Graceful Shutdown으로 DB 연결 종료 및 자원 정리

## 프로젝트 구조

- `src/app.ts` : 앱 부팅/미들웨어/라우팅/종료 처리
- `src/config` : 환경/DB/Redis/Sentry/Auth 등 설정
- `src/routes` : `/api/mgmt`, `/api/svc`, `/api/public`으로 API 분기
- `src/controllers` : HTTP 요청/응답 제어
- `src/services` : 비즈니스 로직
- `src/repos` : Prisma 기반 데이터 접근
- `src/validations` : zod 기반 요청 검증
- `src/middlewares` : 인증, 에러 핸들링, 로깅, 타이머
- `src/utils` : 공용 유틸(이메일/로그/날짜/모니터링 등)
- `prisma/schema.prisma` : DB 스키마 및 도메인 모델
- 의존성 주입: 프레임워크 DI 컨테이너 없이도 `createRequireAuth`, 라우터 팩토리, 서비스 생성자 기반으로 명시적으로 의존성을 주입해 사용했기 때문에, 인증/권한, 외부 서비스 클라이언트, 레포지토리 계층을 교체 가능한 형태로 분리할 수 있습니다. 덕분에 라우팅 단에서는 동작 규칙에만 집중하고 구현체 결합을 낮춰 테스트가 쉬워지며, 기능 추가 시 변경 영향을 최소화할 수 있어 실제 운영 서비스에서의 유지보수성에 직접적인 가치를 더합니다.

## API 분류

백엔드는 크게 3개 라우트 그룹으로 나뉩니다.

### 1) `mgmt` (강사/조교 운영 API)

- 인증, 강의/수강, 시험, 클리닉, 조교, 과제/성적, 일정, 공지, 자료, 대시보드 등
- 운영권한 사용자 대상 기능을 묶음

### 2) `svc` (학생/학부모 서비스 API)

- 인증, 수강, 자녀 연동, 성적, 클리닉, 자료, 질문/공지 열람, 내 정보/업로드 등
- 일반 사용자 관점의 기능 중심

### 3) `public` (공개 인증 API)

- 회원 가입/이메일 인증/로그인 관련 공개 라우트
- 로그인/인증의 진입점 역할

## 엔드포인트 구조(요약)

- Base: `/api/{domain}/v1`
- `/api/mgmt/v1`
  - `/lectures`, `/lectures/:lectureId/assignments`, `/lectures/:lectureId/instructor-posts`
  - `/enrollments`, `/exams`, `/assignment-results`, `/grades`
  - `/materials`, `/instructor-posts`, `/student-posts`, `/assistant-order`
  - `/clinics`, `/schedule-categories`, `/schedules`, `/dashboard`, `/assistant-codes`, `/assistants`
- `/api/svc/v1`
  - `/enrollments`, `/lectures`, `/enrollments/lectures`
  - `/children`, `/grades`, `/clinics`
  - `/materials`, `/student-posts`, `/instructor-posts`, `/dashboard`
  - `/me`, `/uploads`
- `/api/public/v1`
  - `/auth` (로그인/인증 공용 라우트)

- 공통: `GET /health` 헬스체크 제공

## 데이터 구조(요약)

- 사용자 계층: `User`를 중심으로 강사(`Instructor`), 조교(`Assistant`), 학생(`AppStudent`), 학부모(`AppParent`)가 연결됨
  - `mgmt`(강사와 조교)계층은 강사의 인증체계를 중심으로 수업을 운영하는 주체, 데이터 생산자
  - `svc`(학생 유저와 학부모 유저)계층은 `Enrollment` 중심으로 해당되는 데이터를 조회하는 조회자
- 수강 운영 계열: `Enrollment` ↔ `Lecture` ↔ `LectureEnrollment`/`Attendance`
- 과제/평가 계열: `Exam`, `Clinic`, `Assignment`, `Grade`
- 커뮤니케이션 계열: `InstructorPost`, `StudentPost`, `Comment`
- 자원/운영 계열: `Material`, `Schedule`, `ScheduleCategory`
- 인증/보안 확장: Better Auth 기본 모델(`User`, `Session`, `Verification` 등) + 플랫폼용 인증 메타(`VerificationCode`, 조교 서명 상태 등)

## 인증 및 인가 처리 플로우

1. 라우트가 미들웨어 체인을 통과합니다.
2. `requireAuth`가 요청 헤더에서 세션을 조회해 유효하지 않으면 `401` 응답
3. 유효한 세션은 `req.user`, `req.profile`, `req.authSession`에 주입됩니다.
4. 이후 인가 미들웨어(`requireInstructor`, `requireInstructorOrAssistant`, `requireStudent`, `requireParent`, `requireStudentOrParent`)가 사용자 타입을 검증합니다.
5. 조교(`ASSISTANT`)는 서명 승인(`signStatus === SIGNED`) 여부까지 확인되어야 접근 가능
6. 미들웨어에서 검증 실패 시 `401` 또는 `403` 반환

인증 설정은 Better Auth로 관리되며, 다음 특성이 적용됩니다.

- 쿠키 기반 세션(기본 7일) + 주기적 갱신(1일)
- 크로스 도메인 쿠키 옵션(운영 환경 기준)
- trust origin 제한(FRONT_URL 기반)
- 관리자/사용자 역할 체계(admin/user/instructor) 기반 보완 설정

## 배포 구조

- `docker-compose.yml` 기준 Blue/Green 배포 구성이 존재
  - `backend-blue`, `backend-green` 두 서비스 중 하나를 활성화
  - Nginx가 80/443 수신 후 백엔드로 라우팅
- 운영 환경에서는 `.env` 기반으로 `NODE_ENV=production`, `PORT=4000` 사용
- 무중단 종료 처리
  - `SIGTERM`/`SIGINT` 수신 시 라우팅 중단 → 기존 요청 처리 → DB 연결 종료 순으로 정리
- `SENTRY_DSN`, Redis, Lambda 연동 값은 존재 시 동작

## 실행/개발 명령

- 의존성 설치: `pnpm install`
- 개발 실행: `pnpm dev`
- 빌드: `pnpm build`
- 운영 실행: `pnpm start`
- 테스트: `pnpm test`

## 배포/운영 참고

- `docker-compose.yml`로 Blue/Green(`backend-blue`, `backend-green`) + Nginx 컨테이너 실행 가능
- 운영에서는 `.env` 기반 환경변수 주입
- Sentry/람다/Redis 연동은 설정 유무에 따라 선택 동작
