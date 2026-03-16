import { Router } from 'express';
import { KakaoController } from '../controllers/kakao.controller.js';

export const kakaoRouter = Router();
const kakaoController = new KakaoController();

/** GET /api/kakao/auth — 카카오 로그인 URL 리다이렉트 */
kakaoRouter.get('/auth', kakaoController.redirectToKakaoAuth);

/** GET /api/kakao/callback — 인가 코드 수신 → 토큰 저장 */
kakaoRouter.get('/callback', kakaoController.handleKakaoCallback);
