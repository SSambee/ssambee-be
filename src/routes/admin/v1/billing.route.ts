import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  adminCreditGrantSchema,
  approvePaymentSchema,
  createBillingProductSchema,
  instructorIdParamSchema,
  paymentListQuerySchema,
  productIdParamSchema,
  receiptRequestIdParamSchema,
  rejectPaymentSchema,
  updatePaymentRefundStatusSchema,
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
adminBillingRouter.post(
  '/instructors/:instructorId/credit-grants',
  validate(instructorIdParamSchema, 'params'),
  validate(adminCreditGrantSchema),
  billingController.createAdminCreditGrant,
);
adminBillingRouter.get(
  '/instructors/:instructorId/payments',
  validate(instructorIdParamSchema, 'params'),
  validate(paymentListQuerySchema, 'query'),
  billingController.getAdminInstructorPayments,
);
adminBillingRouter.get(
  '/instructors/:instructorId/entitlements',
  validate(instructorIdParamSchema, 'params'),
  billingController.getAdminInstructorEntitlements,
);
adminBillingRouter.get(
  '/instructors/:instructorId/credits',
  validate(instructorIdParamSchema, 'params'),
  billingController.getAdminInstructorCredits,
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
adminBillingRouter.patch(
  '/payments/:id/refund-status',
  validate(productIdParamSchema, 'params'),
  validate(updatePaymentRefundStatusSchema),
  billingController.updatePaymentRefundStatus,
);

adminBillingRouter.patch(
  '/receipt-requests/:id',
  validate(receiptRequestIdParamSchema, 'params'),
  validate(updateReceiptRequestSchema),
  billingController.updateReceiptRequest,
);
