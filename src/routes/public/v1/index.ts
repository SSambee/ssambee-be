import { Router } from 'express';
import { createPublicAuthRoutes } from './auth.routes.js';

export const publicV1Router = Router();

/** 인증 라우트 */
publicV1Router.use('/auth', createPublicAuthRoutes());
