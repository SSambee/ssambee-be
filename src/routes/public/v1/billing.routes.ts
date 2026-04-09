import { Router } from 'express';
import { container } from '../../../config/container.config.js';

export const publicBillingRouter = Router();

publicBillingRouter.get(
  '/products',
  container.billingController.getPublicProducts,
);
