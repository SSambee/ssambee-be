import express from 'express';
import { mgmtV1Router } from './mgmt/v1/index.js';
import { svcV1Router } from './svc/v1/index.js';
import { publicV1Router } from './public/v1/index.js';
import { kakaoRouter } from './kakao.route.js';

export const router = express.Router();

/** 기본 라우트 */
router.get('/', (req, res) => {
  console.log('GET / 요청이 라우터에 도달했습니다.');
  res.json({
    message: 'Hello Express!',
    timestamp: new Date().toISOString(),
  });
});

/** 강사/조교용 API (Management) */
router.use('/api/mgmt/v1', mgmtV1Router);

/** 학생/학부모용 API (Service) */
router.use('/api/svc/v1', svcV1Router);

/** 공개 인증 API (통합) */
router.use('/api/public/v1', publicV1Router);

router.use('/api/kakao', kakaoRouter);

export default router;
