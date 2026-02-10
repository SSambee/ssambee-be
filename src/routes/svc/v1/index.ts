import { Router } from 'express';
import { svcAuthRouter } from './auth.routes.js';
import { svcLecturesRouter } from './lectures.route.js';
import { svcChildrenRouter } from './children.route.js';
import { svcGradesRouter } from './grades.route.js';
import { svcClinicsRouter } from './clinics.route.js';
import { svcMaterialsRouter } from './materials.route.js';

export const svcV1Router = Router();

/** 인증 라우트 */
svcV1Router.use('/auth', svcAuthRouter);

/** 학생/학부모 수강 목록 라우트 */
svcV1Router.use('/lectures', svcLecturesRouter);

/** 학부모/자녀 라우트 */
svcV1Router.use('/children', svcChildrenRouter);

/** 성적 라우트 */
svcV1Router.use('/grades', svcGradesRouter);

/** 클리닉 라우트 */
svcV1Router.use('/clinics', svcClinicsRouter);

/** 자료 라우터 (경로 자체 포함) */
svcV1Router.use('/materials', svcMaterialsRouter);
