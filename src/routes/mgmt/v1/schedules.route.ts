import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createScheduleSchema,
  updateScheduleSchema,
  scheduleIdParamSchema,
  getSchedulesQuerySchema,
} from '../../../validations/schedules.validation.js';

export const mgmtSchedulesRouter = Router();

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtSchedulesRouter.use(container.requireAuth);
mgmtSchedulesRouter.use(container.requireInstructorOrAssistant);

/** 일정 목록 조회 */
mgmtSchedulesRouter.get(
  '/',
  validate(getSchedulesQuerySchema, 'query'),
  container.schedulesController.getSchedules,
);

/** 일정 상세 조회 */
mgmtSchedulesRouter.get(
  '/:id',
  validate(scheduleIdParamSchema, 'params'),
  container.schedulesController.getScheduleById,
);

/** 일정 생성 */
mgmtSchedulesRouter.post(
  '/',
  validate(createScheduleSchema, 'body'),
  container.schedulesController.createSchedule,
);

/** 일정 수정 */
mgmtSchedulesRouter.patch(
  '/:id',
  validate(scheduleIdParamSchema, 'params'),
  validate(updateScheduleSchema, 'body'),
  container.schedulesController.updateSchedule,
);

/** 일정 삭제 */
mgmtSchedulesRouter.delete(
  '/:id',
  validate(scheduleIdParamSchema, 'params'),
  container.schedulesController.deleteSchedule,
);
