import { Router } from 'express';
import { createPublicAuthRoutes } from './auth.routes.js';
import { publicBillingRouter } from './billing.routes.js';

export const publicV1Router = Router();

/** 인증 라우트 */
publicV1Router.use('/auth', createPublicAuthRoutes());

/** 공개 결제 상품 라우트 */
publicV1Router.use('/billing', publicBillingRouter);
