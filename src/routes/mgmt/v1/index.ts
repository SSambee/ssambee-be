import { Router } from 'express';
import { mgmtAuthRouter } from './auth.routes.js';
import { mgmtLecturesRouter } from './lectures.route.js';
import { mgmtEnrollmentsRouter } from './enrollments.route.js';

export const mgmtV1Router = Router();

/** 인증 라우트 */
mgmtV1Router.use('/auth', mgmtAuthRouter);

/** 강의 라우트 */
mgmtV1Router.use('/lectures', mgmtLecturesRouter);

/** 수강 라우트 */
mgmtV1Router.use('/enrollments', mgmtEnrollmentsRouter);

/** 시험 라우트 */
import { mgmtExamsRouter } from './exams.route.js';
mgmtV1Router.use('/exams', mgmtExamsRouter);

/** 클리닉 라우트 */
import { mgmtClinicsRouter } from './clinics.route.js';
mgmtV1Router.use('/clinics', mgmtClinicsRouter);

/** 강의수강생 라우트 */
import { mgmtLectureEnrollmentsRouter } from './lecture-enrollments.route.js';
mgmtV1Router.use('/lectureEnrollments', mgmtLectureEnrollmentsRouter);

/** 조교 가입 코드 라우트 */
import { mgmtAssistantCodesRouter } from './assistant-codes.route.js';
mgmtV1Router.use('/assistant-codes', mgmtAssistantCodesRouter);

/** 조교 라우트 */
import { mgmtAssistantsRouter } from './assistants.route.js';
mgmtV1Router.use('/assistants', mgmtAssistantsRouter);

/** 자료 라우터 */
import { mgmtMaterialsRouter } from './materials.route.js';
mgmtV1Router.use('/materials', mgmtMaterialsRouter);

/** 공지(소통) 라우트 */
import { mgmtInstructorPostsRouter } from './instructor-posts.route.js';
mgmtV1Router.use('/instructor-posts', mgmtInstructorPostsRouter);

/** 강의 내 공지 라우트 (Nested) */
mgmtV1Router.use(
  '/lectures/:lectureId/instructor-posts',
  mgmtInstructorPostsRouter,
);

/** 학생 질문 라우트 */
import { mgmtStudentPostsRouter } from './student-posts.route.js';
mgmtV1Router.use('/student-posts', mgmtStudentPostsRouter);

/** 지시 생성 라우트 */
import { mgmtAssistantOrderRouter } from './assistant-order.route.js';
mgmtV1Router.use('/assistant-order', mgmtAssistantOrderRouter);

/** 일정 카테고리 라우트 */
import { mgmtScheduleCategoriesRouter } from './schedule-categories.route.js';
mgmtV1Router.use('/schedule-categories', mgmtScheduleCategoriesRouter);

/** 과제 카테고리 라우트 */
import { mgmtAssignmentCategoriesRouter } from './assignment-categories.route.js';
mgmtV1Router.use('/assignment-categories', mgmtAssignmentCategoriesRouter);

/** 일정 라우트 */
import { mgmtSchedulesRouter } from './schedules.route.js';
mgmtV1Router.use('/schedules', mgmtSchedulesRouter);

/** 과제 라우트 */
import { mgmtAssignmentsRouter } from './assignments.route.js';
mgmtV1Router.use('/assignments', mgmtAssignmentsRouter);

/** 강의 내 과제 라우트 (Nested) */
mgmtV1Router.use('/lectures/:lectureId/assignments', mgmtAssignmentsRouter);
