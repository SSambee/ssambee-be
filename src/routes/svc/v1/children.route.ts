import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createChildSchema,
  childIdParamSchema,
} from '../../../validations/children.validation.js';
import {
  enrollmentIdParamSchema,
  gradeIdParamSchema,
} from '../../../validations/grades.validation.js';
import { getSvcEnrollmentsQuerySchema } from '../../../validations/enrollments.validation.js';

export const svcChildrenRouter = Router();

const { requireAuth, requireParent, childrenController } = container;

/** 모든 라우트에 대해 인증 및 학부모 권한 필요 */
svcChildrenRouter.use(requireAuth);
svcChildrenRouter.use(requireParent);

/** 자녀 등록 (전화번호 연동) */
svcChildrenRouter.post(
  '/',
  validate(createChildSchema, 'body'),
  childrenController.registerChild,
);

/** 자녀 목록 조회 */
svcChildrenRouter.get('/', childrenController.getChildren);

/** 자녀 수강 목록 조회 */
svcChildrenRouter.get(
  '/:id/enrollments',
  validate(getSvcEnrollmentsQuerySchema, 'query'),
  childrenController.getChildEnrollments,
);

/** 자녀 수강 상세 조회 */
svcChildrenRouter.get(
  '/:id/enrollments/:enrollmentId',
  validate(childIdParamSchema, 'params'),
  childrenController.getChildEnrollmentDetail,
);

/** 자녀의 수강별 성적 목록 조회 */
svcChildrenRouter.get(
  '/:id/enrollments/:enrollmentId/grades',
  validate(childIdParamSchema, 'params'),
  validate(enrollmentIdParamSchema, 'params'),
  childrenController.getChildGradesByEnrollment,
);

/** 자녀의 성적 상세 조회 */
svcChildrenRouter.get(
  '/:id/grades/:gradeId',
  validate(childIdParamSchema, 'params'),
  validate(gradeIdParamSchema, 'params'),
  childrenController.getChildGradeDetail,
);

/** 자녀의 클리닉 목록 조회 */
svcChildrenRouter.get(
  '/:id/clinics',
  validate(childIdParamSchema, 'params'),
  childrenController.getChildClinics,
);
