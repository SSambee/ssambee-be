import { Router } from 'express';
import { adminAuthRouter } from './auth.routes.js';
import { adminsRouter } from './admins.route.js';
import { adminBillingRouter } from './billing.route.js';
import { adminUsersRouter } from './users.route.js';

export const adminV1Router = Router();

adminV1Router.use('/auth', adminAuthRouter);
adminV1Router.use('/admins', adminsRouter);
adminV1Router.use('/billing', adminBillingRouter);
adminV1Router.use('/users', adminUsersRouter);
