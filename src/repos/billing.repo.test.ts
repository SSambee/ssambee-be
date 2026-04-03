import { BillingRepository } from './billing.repo.js';
import {
  CreditBucketStatus,
  EntitlementStatus,
} from '../constants/billing.constant.js';

describe('BillingRepository', () => {
  const entitlementFindFirst = jest.fn();
  const entitlementFindMany = jest.fn();
  const creditBucketFindMany = jest.fn();
  const prisma = {
    entitlement: {
      findFirst: entitlementFindFirst,
      findMany: entitlementFindMany,
    },
    creditBucket: {
      findMany: creditBucketFindMany,
    },
  } as never;

  let repo: BillingRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new BillingRepository(prisma);
  });

  it('findActiveEntitlement는 현재 시각 이후 endsAt만 활성으로 조회해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.findActiveEntitlement('instructor-1', now);

    expect(entitlementFindFirst).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: EntitlementStatus.ACTIVE,
        endsAt: {
          gt: now,
        },
      },
      orderBy: { startsAt: 'asc' },
    });
  });

  it('listEntitlementsToExpire는 경계 시각과 같은 endsAt도 만료 대상으로 포함해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.listEntitlementsToExpire(now, { instructorId: 'instructor-1' });

    expect(entitlementFindMany).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: EntitlementStatus.ACTIVE,
        endsAt: {
          lte: now,
        },
      },
      orderBy: { endsAt: 'asc' },
    });
  });

  it('listActiveCreditBuckets는 현재 시각 이후 expiresAt만 활성 bucket으로 조회해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.listActiveCreditBuckets('instructor-1', now);

    expect(creditBucketFindMany).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: CreditBucketStatus.ACTIVE,
        remainingAmount: {
          gt: 0,
        },
        expiresAt: {
          gt: now,
        },
      },
      orderBy: [{ expiresAt: 'asc' }, { grantedAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('listCreditBucketsToExpire는 경계 시각과 같은 expiresAt도 만료 대상으로 포함해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.listCreditBucketsToExpire(now, {
      instructorId: 'instructor-1',
    });

    expect(creditBucketFindMany).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: CreditBucketStatus.ACTIVE,
        expiresAt: {
          lte: now,
        },
      },
      orderBy: { expiresAt: 'asc' },
    });
  });
});
