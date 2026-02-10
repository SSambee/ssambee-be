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

/** 자료 라우터 (경로 자체 포함) */
import { mgmtMaterialsRouter } from './materials.route.js';
mgmtV1Router.use('/materials', mgmtMaterialsRouter);
