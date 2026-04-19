import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { KakaoController } from '../../../controllers/kakao.controller.js';

export const mgmtKakaoRouter = Router();

const { requireAuth, requireInstructorOrAssistant } = container;
const kakaoController = new KakaoController();

mgmtKakaoRouter.use(requireAuth);
mgmtKakaoRouter.use(requireInstructorOrAssistant);
mgmtKakaoRouter.use(container.requireActiveInstructorEntitlement);

mgmtKakaoRouter.post('/memo', kakaoController.sendMemo);
