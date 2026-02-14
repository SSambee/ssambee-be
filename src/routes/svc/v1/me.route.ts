import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { updateMyProfileSchema } from '../../../validations/profile.validation.js';
import { requireUserType } from '../../../middlewares/auth.middleware.js';
import { UserType } from '../../../constants/auth.constant.js';

export const svcMeRouter = Router();

const { requireAuth, profileController } = container;

// 학생 또는 학부모만 접근 가능
const requireStudentOrParent = requireUserType(
  UserType.STUDENT,
  UserType.PARENT,
);

/** 모든 라우트에 대해 인증 + 학생/학부모 권한 필요 */
svcMeRouter.use(requireAuth);
svcMeRouter.use(requireStudentOrParent);

/** 내 프로필 조회 */
svcMeRouter.get('/', profileController.getMyProfile);

/** 내 프로필 수정 */
svcMeRouter.patch(
  '/',
  validate(updateMyProfileSchema, 'body'),
  profileController.updateMyProfile,
);
