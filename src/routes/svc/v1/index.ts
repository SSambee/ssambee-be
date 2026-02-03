import { Router } from 'express';
import { svcAuthRouter } from './auth.routes.js';
import { svcLecturesRouter } from './enrollments.route.js';
import { svcChildrenRouter } from './children.route.js';

export const svcV1Router = Router();

/** 인증 라우트 */
svcV1Router.use('/auth', svcAuthRouter);

/** 학생/학부모 수강 목록 라우트 */
svcV1Router.use('/lectures', svcLecturesRouter);

/** 학부모/자녀 라우트 */
svcV1Router.use('/children', svcChildrenRouter);
