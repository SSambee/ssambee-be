import { config } from '../config/env.config.js';
import type { BillingService } from '../services/billing.service.js';
import { runBillingReconcileTask } from '../services/billing-reconcile.task.js';
import type { ScheduledJobDefinition } from '../services/scheduler.service.js';

export const SchedulerJobId = {
  BILLING_RECONCILE: 'billing-reconcile',
} as const;

export const SchedulerDefaults = {
  POLL_INTERVAL_SECONDS: 15,
  BILLING_RECONCILE_LEASE_TTL_SECONDS: 300,
  BILLING_RECONCILE_RETRY_DELAY_SECONDS: 300,
} as const;

export function createScheduledJobs(deps: {
  billingService: Pick<BillingService, 'reconcileAllBilling'>;
}): ScheduledJobDefinition[] {
  return [
    {
      id: SchedulerJobId.BILLING_RECONCILE,
      description: 'Expire entitlements and recharge credits',
      cron: config.BILLING_RECONCILE_CRON,
      timezone: config.BILLING_RECONCILE_TIMEZONE,
      leaseTtlSeconds: SchedulerDefaults.BILLING_RECONCILE_LEASE_TTL_SECONDS,
      retryDelaySeconds:
        SchedulerDefaults.BILLING_RECONCILE_RETRY_DELAY_SECONDS,
      handler: async ({ triggeredAt, signal }) => {
        await runBillingReconcileTask(deps.billingService, triggeredAt, signal);
      },
    },
  ];
}
