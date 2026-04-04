import 'dotenv/config';
import { prisma } from '../config/db.config.js';
import { BillingRepository } from '../repos/billing.repo.js';
import { BillingService } from '../services/billing.service.js';

const billingRepo = new BillingRepository(prisma);
const billingService = new BillingService(billingRepo, prisma);

try {
  const result = await billingService.reconcileAllBilling();
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
} catch (error) {
  console.error(
    'billing reconcile failed:',
    error instanceof Error ? error.message : error,
  );
  await prisma.$disconnect();
  process.exit(1);
}
