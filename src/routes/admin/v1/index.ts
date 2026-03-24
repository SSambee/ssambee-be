import { Router } from 'express';
import { adminAuthRouter } from './auth.routes.js';
import { adminBillingRouter } from './billing.route.js';

export const adminV1Router = Router();

adminV1Router.use('/auth', adminAuthRouter);
adminV1Router.use('/billing', adminBillingRouter);
