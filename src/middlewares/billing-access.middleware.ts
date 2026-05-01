import { NextFunction, Request, Response } from 'express';
import { BillingService } from '../services/billing.service.js';
import { getInstructorIdOrThrow } from '../utils/user.util.js';

export const createRequireActiveInstructorEntitlement = (
  billingService: BillingService,
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      await billingService.assertMgmtAccess(instructorId);
      next();
    } catch (error) {
      next(error);
    }
  };
};
