import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  approvePaymentSchema,
  createBillingProductSchema,
  paymentListQuerySchema,
  paymentItemIdParamSchema,
  productIdParamSchema,
  receiptRequestIdParamSchema,
  rejectPaymentSchema,
  revokeEntitlementsSchema,
  revokeRechargeCreditsSchema,
  updateBillingProductSchema,
  updateReceiptRequestSchema,
} from '../../../validations/billing.validation.js';

export const adminBillingRouter = Router();

const { requireAuth, requireAdmin, billingController } = container;

adminBillingRouter.use(requireAuth);
adminBillingRouter.use(requireAdmin);

adminBillingRouter.get('/products', billingController.getAdminProducts);
adminBillingRouter.post(
  '/products',
  validate(createBillingProductSchema),
  billingController.createProduct,
);
adminBillingRouter.patch(
  '/products/:id',
  validate(productIdParamSchema, 'params'),
  validate(updateBillingProductSchema),
  billingController.updateProduct,
);

adminBillingRouter.get(
  '/payments',
  validate(paymentListQuerySchema, 'query'),
  billingController.getAdminPayments,
);
adminBillingRouter.get('/payments/:id', billingController.getAdminPayment);
adminBillingRouter.post(
  '/payments/:id/approve',
  validate(productIdParamSchema, 'params'),
  validate(approvePaymentSchema),
  billingController.approvePayment,
);
adminBillingRouter.post(
  '/payments/:id/reject',
  validate(productIdParamSchema, 'params'),
  validate(rejectPaymentSchema),
  billingController.rejectPayment,
);
adminBillingRouter.post(
  '/payment-items/:paymentItemId/revoke-entitlements',
  validate(paymentItemIdParamSchema, 'params'),
  validate(revokeEntitlementsSchema),
  billingController.revokeEntitlements,
);
adminBillingRouter.post(
  '/payment-items/:paymentItemId/revoke-recharge-credits',
  validate(paymentItemIdParamSchema, 'params'),
  validate(revokeRechargeCreditsSchema),
  billingController.revokeRechargeCredits,
);

adminBillingRouter.patch(
  '/receipt-requests/:id',
  validate(receiptRequestIdParamSchema, 'params'),
  validate(updateReceiptRequestSchema),
  billingController.updateReceiptRequest,
);
