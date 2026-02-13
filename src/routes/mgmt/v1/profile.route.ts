import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { updateMyProfileSchema } from '../../../validations/profile.validation.js';

export const mgmtProfileRouter = Router();

const { requireAuth, requireInstructorOrAssistant, profileController } =
  container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtProfileRouter.use(requireAuth);
mgmtProfileRouter.use(requireInstructorOrAssistant);

/** 내 프로필 조회 */
mgmtProfileRouter.get('/', profileController.getMyProfile);

/** 내 프로필 수정 */
mgmtProfileRouter.patch(
  '/',
  validate(updateMyProfileSchema, 'body'),
  profileController.updateMyProfile,
);
