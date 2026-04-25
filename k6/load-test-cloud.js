// SsamBee k6 Load Test — Grafana Cloud Edition
// 강사(Heavy) 10 VU + 학생(Light) 50 VU = 60 VU baseline

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import tempo from 'https://jslib.k6.io/http-instrumentation-tempo/1.0.0/index.js';
import pyroscope from 'https://jslib.k6.io/http-instrumentation-pyroscope/1.0.1/index.js';

// ── Config ──────────────────────────────────────────────────
const BASE_URL = __ENV.K6_BASE_URL || 'https://ssambee-be.onrender.com';
const TEST_PASSWORD = __ENV.K6_TEST_PASSWORD || 'Test1234!';

// ── Options ─────────────────────────────────────────────────
export const options = {
  cloud: {
    distribution: {
      distributionLabel1: { loadZone: 'amazon:kr:seoul', percent: 100 },
    },
  },
  scenarios: {
    instructor_flow: {
      executor: 'ramping-vus',
      startVUs: 1, // ✅ Fix: 0 → 1 (Grafana Cloud: 0 허용 안 함)
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'instructorScenario',
      tags: { scenario: 'instructor' },
    },
    student_flow: {
      executor: 'ramping-vus',
      startVUs: 1, // ✅ Fix: 0 → 1
      stages: [
        { duration: '1m', target: 10 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'studentScenario',
      tags: { scenario: 'student' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.90'],
  },
  ext: {
    loadimpact: {
      projectID: 7371633,
      name: 'SsamBee — 강사/학생 부하 테스트',
    },
  },
};

// ── Instrumentation ──────────────────────────────────────────
tempo.instrumentHTTP({ propagator: 'w3c' });
pyroscope.instrumentHTTP();

// ── Helpers ──────────────────────────────────────────────────
function login(email, userType) {
  const res = http.post(
    `${BASE_URL}/api/public/v1/auth/signin`,
    JSON.stringify({ email, password: TEST_PASSWORD, userType }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' },
    },
  );

  const ok = check(res, {
    'Login: status 200': (r) => r.status === 200,
    'Login: success': (r) => {
      try { return r.json('status') === 'success'; } catch { return false; }
    },
  });

  if (!ok) {
    console.error(`VU ${__VU}: login failed for ${email} — status ${res.status}`);
  }
  return ok;
}

// ── Instructor Scenario (Heavy) ───────────────────────────────
export function instructorScenario() {
  // ✅ Fix: 1~10 범위로 정규화
  const vuIndex = ((__VU - 1) % 10) + 1;
  const email = `k6_instructor_${vuIndex}@ssambee.co.kr`;

  if (!login(email, 'INSTRUCTOR')) return;
  sleep(0.5);

  let lectureId = '';

  group('GetLectures', function () {
    const res = http.get(`${BASE_URL}/api/mgmt/v1/lectures`, {
      tags: { name: 'GetLectures' },
    });
    check(res, { 'GetLectures: 200': (r) => r.status === 200 });
    try {
      const lectures = res.json('data.lectures');
      if (Array.isArray(lectures) && lectures.length > 0) {
        lectureId = lectures[0].id;
      }
    } catch {}
  });

  sleep(0.5);

  if (lectureId) {
    group('GetLectureDetail', function () {
      const res = http.get(`${BASE_URL}/api/mgmt/v1/lectures/${lectureId}`, {
        tags: { name: 'GetLectureDetail' },
      });
      check(res, { 'GetLectureDetail: 200': (r) => r.status === 200 });
    });
    sleep(0.5);
  }

  // ✅ Fix: http.file()을 body 객체에 직접 포함 (files 옵션 제거)
  group('CreateInstructorPost', function () {
    const fileContent = new Uint8Array(512);
    for (let i = 0; i < 512; i++) fileContent[i] = i % 256;

    const formData = {
      title: `[k6] 공지 VU${vuIndex}-${__ITER}`,
      content: 'k6 부하테스트 자동 생성 공지사항입니다.',
      scope: lectureId ? 'LECTURE' : 'GLOBAL',
      targetRole: 'ALL',
      isImportant: 'false',
      file: http.file(fileContent, `k6_upload_${vuIndex}.txt`, 'text/plain'),
    };
    if (lectureId) formData.lectureId = lectureId;

    const res = http.post(
      `${BASE_URL}/api/mgmt/v1/instructor-posts/submit`,
      formData,
      { tags: { name: 'CreateInstructorPost' } },
    );
    check(res, {
      'CreateInstructorPost: success': (r) => r.status === 200 || r.status === 201,
    });
  });

  sleep(0.5);

  if (lectureId) {
    group('CreateAttendance', function () {
      const today = new Date().toISOString().split('T')[0];
      const res = http.post(
        `${BASE_URL}/api/mgmt/v1/attendances/bulk`,
        JSON.stringify({
          lectureId,
          date: today,
          attendances: [
            { enrollmentId: `k6-dummy-${vuIndex}-1`, status: 'PRESENT' },
            { enrollmentId: `k6-dummy-${vuIndex}-2`, status: 'PRESENT' },
            { enrollmentId: `k6-dummy-${vuIndex}-3`, status: 'LATE' },
            { enrollmentId: `k6-dummy-${vuIndex}-4`, status: 'ABSENT' },
            { enrollmentId: `k6-dummy-${vuIndex}-5`, status: 'PRESENT' },
          ],
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'CreateAttendance' },
        },
      );
      // 400 expected for dummy enrollmentIds — DB 쿼리 부하 목적
      check(res, { 'CreateAttendance: responded': (r) => r.status < 500 });
    });
    sleep(0.5);
  }

  group('GetDashboard', function () {
    const res = http.get(`${BASE_URL}/api/mgmt/v1/dashboard`, {
      tags: { name: 'GetDashboard' },
    });
    check(res, { 'GetDashboard: 200': (r) => r.status === 200 });
  });

  sleep(2);
}

// ── Student Scenario (Light) ──────────────────────────────────
export function studentScenario() {
  // ✅ Fix: 1~50 범위로 정규화 (__VU - 10 → 비결정적이었음)
  const studentIndex = ((__VU - 1) % 50) + 1;
  const email = `k6_student_${studentIndex}@ssambee.co.kr`;

  if (!login(email, 'STUDENT')) return;
  sleep(2);

  let lectureId = '';
  let postId = '';

  group('GetEnrollments', function () {
    const res = http.get(`${BASE_URL}/api/svc/v1/enrollments`, {
      tags: { name: 'GetEnrollments' },
    });
    check(res, { 'GetEnrollments: 200': (r) => r.status === 200 });
    try {
      const enrollments = res.json('data.enrollments');
      if (Array.isArray(enrollments) && enrollments.length > 0) {
        const le = enrollments[0].lectureEnrollments;
        if (Array.isArray(le) && le.length > 0) {
          lectureId = le[0].lectureId;
        }
      }
    } catch {}
  });

  sleep(2);

  group('GetStudentPosts', function () {
    const params = lectureId ? `?lectureId=${lectureId}` : '';
    const res = http.get(`${BASE_URL}/api/svc/v1/student-posts${params}`, {
      tags: { name: 'GetStudentPosts' },
    });
    check(res, { 'GetStudentPosts: 200': (r) => r.status === 200 });
    try {
      const posts = res.json('data.posts');
      if (Array.isArray(posts) && posts.length > 0) {
        postId = posts[0].id;
      }
    } catch {}
  });

  sleep(2);

  // ✅ Fix: http.file()을 body 객체에 직접 포함
  group('CreateStudentPost', function () {
    const fileContent = new Uint8Array(256);
    for (let i = 0; i < 256; i++) fileContent[i] = i % 128;

    const formData = {
      title: `[k6] 질문 학생${studentIndex}-${__ITER}`,
      content: 'k6 부하테스트 자동 생성 질문입니다.',
      file: http.file(fileContent, `k6_q_${studentIndex}.txt`, 'text/plain'),
    };
    if (lectureId) formData.lectureId = lectureId;

    const res = http.post(
      `${BASE_URL}/api/svc/v1/student-posts`,
      formData,
      { tags: { name: 'CreateStudentPost' } },
    );
    check(res, {
      'CreateStudentPost: success': (r) => r.status === 200 || r.status === 201,
    });
  });

  sleep(2);

  if (postId) {
    group('GetPostDetail', function () {
      const res = http.get(`${BASE_URL}/api/svc/v1/student-posts/${postId}`, {
        tags: { name: 'GetPostDetail' },
      });
      check(res, { 'GetPostDetail: 200': (r) => r.status === 200 });
    });
    sleep(2);
  }

  group('GetStudentDashboard', function () {
    const res = http.get(`${BASE_URL}/api/svc/v1/dashboard`, {
      tags: { name: 'GetStudentDashboard' },
    });
    check(res, { 'GetStudentDashboard: 200': (r) => r.status === 200 });
  });

  sleep(5);
}// SsamBee k6 Load Test
// 강사(Heavy) 10 VU + 학생(Light) 50 VU = 60 VU baseline
// 1GB RAM EC2 — 점진적 부하 상승

import http from 'k6/http';
import { check, sleep, group } from 'k6';

// ── Config ─────────────────────────────────────────────────
const BASE_URL = __ENV.K6_BASE_URL || 'https://ssambee-be.onrender.com';
const TEST_PASSWORD = __ENV.K6_TEST_PASSWORD || 'Test1234!';

// ── Options ────────────────────────────────────────────────
export const options = {
  scenarios: {
    instructor_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2 },
        { duration: '3m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'instructorScenario',
    },
    student_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '5m', target: 50 },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      exec: 'studentScenario',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.90'],
  },
};

// ── Helpers ────────────────────────────────────────────────
function login(email, userType) {
  const res = http.post(
    `${BASE_URL}/api/public/v1/auth/signin`,
    JSON.stringify({
      email,
      password: TEST_PASSWORD,
      userType,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Login' },
    },
  );

  // Cookie jar automatically stores ssambee-auth.session_token
  const ok = check(res, {
    'Login: status 200': (r) => r.status === 200,
    'Login: success': (r) => {
      try {
        return r.json('status') === 'success';
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`VU ${__VU}: login failed for ${email} — status ${res.status}`);
  }
  return ok;
}

// ── Instructor Scenario (Heavy) ────────────────────────────
// VU 1~10 → k6_instructor_{1~10}
export function instructorScenario() {
  const vuIndex = __VU;
  const email = `k6_instructor_${vuIndex}@ssambee.co.kr`;

  // Login
  if (!login(email, 'INSTRUCTOR')) return;

  sleep(0.5);

  let lectureId = '';

  // 1. 강의 목록
  group('GetLectures', function () {
    const res = http.get(`${BASE_URL}/api/mgmt/v1/lectures`, {
      tags: { name: 'GetLectures' },
    });
    check(res, {
      'GetLectures: 200': (r) => r.status === 200,
    });
    try {
      const lectures = res.json('data.lectures');
      if (Array.isArray(lectures) && lectures.length > 0) {
        lectureId = lectures[0].id;
      }
    } catch {
      // response parse error
    }
  });

  sleep(0.5);

  // 2. 강의 상세
  if (lectureId) {
    group('GetLectureDetail', function () {
      const res = http.get(`${BASE_URL}/api/mgmt/v1/lectures/${lectureId}`, {
        tags: { name: 'GetLectureDetail' },
      });
      check(res, {
        'GetLectureDetail: 200': (r) => r.status === 200,
      });
    });

    sleep(0.5);
  }

  // 3. 공지 작성 (multipart with file)
  group('CreateInstructorPost', function () {
    const fileContent = new Uint8Array(512);
    for (let i = 0; i < 512; i++) fileContent[i] = i % 256;

    const data = {
      title: `[k6] 공지 VU${__VU}-${__ITER}`,
      content: `k6 부하테스트 자동 생성 공지사항입니다. VU=${__VU}, ITER=${__ITER}`,
      scope: lectureId ? 'LECTURE' : 'GLOBAL',
      targetRole: 'ALL',
      isImportant: 'false',
    };

    if (lectureId) {
      data.lectureId = lectureId;
    }

    const res = http.post(`${BASE_URL}/api/mgmt/v1/instructor-posts/submit`, data, {
      files: { file: http.file(fileContent, `k6_upload_${__VU}.txt`, 'text/plain') },
      tags: { name: 'CreateInstructorPost' },
    });
    check(res, {
      'CreateInstructorPost: success': (r) => r.status === 200 || r.status === 201,
    });
  });

  sleep(0.5);

  // 4. 출석 등록 (bulk)
  if (lectureId) {
    group('CreateAttendance', function () {
      const today = new Date().toISOString().split('T')[0];
      const res = http.post(
        `${BASE_URL}/api/mgmt/v1/attendances/bulk`,
        JSON.stringify({
          lectureId,
          date: today,
          attendances: [
            { enrollmentId: `k6-dummy-${__VU}-1`, status: 'PRESENT' },
            { enrollmentId: `k6-dummy-${__VU}-2`, status: 'PRESENT' },
            { enrollmentId: `k6-dummy-${__VU}-3`, status: 'LATE' },
            { enrollmentId: `k6-dummy-${__VU}-4`, status: 'ABSENT' },
            { enrollmentId: `k6-dummy-${__VU}-5`, status: 'PRESENT' },
          ],
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          tags: { name: 'CreateAttendance' },
        },
      );
      // 400 expected for dummy enrollmentIds — tests DB query load
      check(res, {
        'CreateAttendance: responded': (r) => r.status < 500,
      });
    });

    sleep(0.5);
  }

  // 5. 대시보드
  group('GetDashboard', function () {
    const res = http.get(`${BASE_URL}/api/mgmt/v1/dashboard`, {
      tags: { name: 'GetDashboard' },
    });
    check(res, {
      'GetDashboard: 200': (r) => r.status === 200,
    });
  });

  sleep(2);
}

// ── Student Scenario (Light) ───────────────────────────────
// VU 11~60 → k6_student_{1~50}
export function studentScenario() {
  const studentIndex = __VU - 10;
  const email = `k6_student_${studentIndex}@ssambee.co.kr`;

  // Login
  if (!login(email, 'STUDENT')) return;

  sleep(2);

  let lectureId = '';
  let postId = '';

  // 1. 내 수강 목록
  group('GetEnrollments', function () {
    const res = http.get(`${BASE_URL}/api/svc/v1/enrollments`, {
      tags: { name: 'GetEnrollments' },
    });
    check(res, {
      'GetEnrollments: 200': (r) => r.status === 200,
    });
    try {
      const enrollments = res.json('data.enrollments');
      if (Array.isArray(enrollments) && enrollments.length > 0) {
        // Get lectureId from first enrollment's lectureEnrollments
        const le = enrollments[0].lectureEnrollments;
        if (Array.isArray(le) && le.length > 0) {
          lectureId = le[0].lectureId;
        }
      }
    } catch {
      // parse error
    }
  });

  sleep(2);

  // 2. 게시물 목록
  group('GetStudentPosts', function () {
    const params = lectureId ? `?lectureId=${lectureId}` : '';
    const res = http.get(`${BASE_URL}/api/svc/v1/student-posts${params}`, {
      tags: { name: 'GetStudentPosts' },
    });
    check(res, {
      'GetStudentPosts: 200': (r) => r.status === 200,
    });
    try {
      const posts = res.json('data.posts');
      if (Array.isArray(posts) && posts.length > 0) {
        postId = posts[0].id;
      }
    } catch {
      // parse error
    }
  });

  sleep(2);

  // 3. 질문 작성 (multipart with file)
  group('CreateStudentPost', function () {
    const fileContent = new Uint8Array(256);
    for (let i = 0; i < 256; i++) fileContent[i] = i % 128;

    const data = {
      title: `[k6] 질문 학생${studentIndex}-${__ITER}`,
      content: `k6 부하테스트 자동 생성 질문입니다.`,
    };

    if (lectureId) {
      data.lectureId = lectureId;
    }

    const res = http.post(`${BASE_URL}/api/svc/v1/student-posts`, data, {
      files: { file: http.file(fileContent, `k6_q_${studentIndex}.txt`, 'text/plain') },
      tags: { name: 'CreateStudentPost' },
    });
    check(res, {
      'CreateStudentPost: success': (r) => r.status === 200 || r.status === 201,
    });
  });

  sleep(2);

  // 4. 게시물 상세
  if (postId) {
    group('GetPostDetail', function () {
      const res = http.get(`${BASE_URL}/api/svc/v1/student-posts/${postId}`, {
        tags: { name: 'GetPostDetail' },
      });
      check(res, {
        'GetPostDetail: 200': (r) => r.status === 200,
      });
    });

    sleep(2);
  }

  // 5. 대시보드
  group('GetStudentDashboard', function () {
    const res = http.get(`${BASE_URL}/api/svc/v1/dashboard`, {
      tags: { name: 'GetStudentDashboard' },
    });
    check(res, {
      'GetStudentDashboard: 200': (r) => r.status === 200,
    });
  });

  // 학생은 간헐적 접근 — 긴 sleep
  sleep(5);
}
