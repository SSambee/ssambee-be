import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createBankTransferPaymentSchema,
  creditHistoryQuerySchema,
  paymentIdParamSchema,
  paymentListQuerySchema,
} from '../../../validations/billing.validation.js';

export const mgmtBillingRouter = Router();

const {
  requireAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  billingController,
} = container;

mgmtBillingRouter.get(
  '/access-status',
  requireAuth,
  requireInstructorOrAssistant,
  billingController.getAccessStatus,
);

mgmtBillingRouter.use(requireAuth);
mgmtBillingRouter.use(requireInstructor);

mgmtBillingRouter.get('/products', billingController.getProducts);

mgmtBillingRouter.post(
  '/payments/bank-transfer',
  validate(createBankTransferPaymentSchema),
  billingController.createBankTransferPayment,
);

mgmtBillingRouter.get(
  '/payments',
  validate(paymentListQuerySchema, 'query'),
  billingController.getInstructorPayments,
);

mgmtBillingRouter.get(
  '/payments/:paymentId',
  validate(paymentIdParamSchema, 'params'),
  billingController.getInstructorPayment,
);
mgmtBillingRouter.post(
  '/payments/:paymentId/cancel',
  validate(paymentIdParamSchema, 'params'),
  billingController.cancelInstructorPayment,
);

mgmtBillingRouter.get('/entitlements', billingController.getEntitlements);
mgmtBillingRouter.get('/credits', billingController.getCredits);
mgmtBillingRouter.get(
  '/credits/history',
  validate(creditHistoryQuerySchema, 'query'),
  billingController.getCreditHistory,
);
