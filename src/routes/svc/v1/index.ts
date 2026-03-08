import { Router } from 'express';
import { svcAuthRouter } from './auth.routes.js';
import { svcEnrollmentsRouter } from './enrollments.route.js';
import { svcChildrenRouter } from './children.route.js';
import { svcLecturesRouter } from './lectures.route.js';
import { svcGradesRouter } from './grades.route.js';
import { svcClinicsRouter } from './clinics.route.js';
import { svcMaterialsRouter } from './materials.route.js';
import { svcStudentPostsRouter } from './student-posts.route.js';
import { svcInstructorPostsRouter } from './instructor-posts.route.js';
import { svcMeRouter } from './me.route.js';
import { svcDashboardRouter } from './dashboard.route.js';

export const svcV1Router = Router();

/** 인증 라우트 */
svcV1Router.use('/auth', svcAuthRouter);

/** 학생 강사-수강 목록 라우트 */
svcV1Router.use('/enrollments', svcEnrollmentsRouter);

/** 학생 강의별 수강 라우트 (하위 호환성 유지) */
svcV1Router.use('/lectures', svcLecturesRouter);
svcV1Router.use('/enrollments/lectures', svcLecturesRouter);

/** 학부모/자녀 라우트 */
svcV1Router.use('/children', svcChildrenRouter);

/** 성적 라우트 */
svcV1Router.use('/grades', svcGradesRouter);

/** 클리닉 라우트 */
svcV1Router.use('/clinics', svcClinicsRouter);

/** 자료 라우터 */
svcV1Router.use('/materials', svcMaterialsRouter);

/** 학생 질문 라우트 */
svcV1Router.use('/student-posts', svcStudentPostsRouter);

/** 강사 공지 라우트 */
svcV1Router.use('/instructor-posts', svcInstructorPostsRouter);

/** 대시보드 라우트 */
svcV1Router.use('/dashboard', svcDashboardRouter);

/** 내 정보 라우트 */
svcV1Router.use('/me', svcMeRouter);
