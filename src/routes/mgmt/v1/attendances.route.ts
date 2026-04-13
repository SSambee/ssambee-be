import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { attendanceIdParamSchema } from '../../../validations/attendances.validation.js';

export const mgmtAttendancesRouter = Router();

const { requireAuth, requireInstructorOrAssistant, attendancesController } =
  container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtAttendancesRouter.use(requireAuth);
mgmtAttendancesRouter.use(requireInstructorOrAssistant);
mgmtAttendancesRouter.use(container.requireActiveInstructorEntitlement);

/** 출결 삭제 */
mgmtAttendancesRouter.delete(
  '/:attendanceId',
  validate(attendanceIdParamSchema, 'params'),
  attendancesController.deleteAttendance,
);
