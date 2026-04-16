import type { BillingService } from './billing.service.js';

export async function runBillingReconcileTask(
  billingService: Pick<BillingService, 'reconcileAllBilling'>,
  now: Date = new Date(),
  signal?: AbortSignal,
) {
  return billingService.reconcileAllBilling(now, signal);
}
