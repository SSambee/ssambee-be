import { BillingRepository } from './billing.repo.js';
import {
  BillingProductType,
  PaymentStatus,
  CreditBucketStatus,
  CreditSourceType,
  EntitlementStatus,
} from '../constants/billing.constant.js';

describe('BillingRepository', () => {
  const entitlementFindFirst = jest.fn();
  const entitlementFindMany = jest.fn();
  const creditBucketFindMany = jest.fn();
  const creditBucketUpsert = jest.fn();
  const paymentUpdate = jest.fn();
  const paymentUpdateMany = jest.fn();
  const paymentFindFirst = jest.fn();
  const paymentFindUnique = jest.fn();
  const prisma = {
    entitlement: {
      findFirst: entitlementFindFirst,
      findMany: entitlementFindMany,
    },
    payment: {
      findFirst: paymentFindFirst,
      update: paymentUpdate,
      updateMany: paymentUpdateMany,
      findUnique: paymentFindUnique,
    },
    creditBucket: {
      findMany: creditBucketFindMany,
      upsert: creditBucketUpsert,
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

  it('findReadyQueuedEntitlement는 시작되었고 아직 종료되지 않은 queued entitlement만 조회해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.findReadyQueuedEntitlement('instructor-1', now);

    expect(entitlementFindFirst).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: EntitlementStatus.QUEUED,
        startsAt: {
          lte: now,
        },
        endsAt: {
          gt: now,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { sequenceNo: 'asc' }],
    });
  });

  it('listReadyQueuedEntitlements는 시작되었고 아직 종료되지 않은 queued entitlement만 조회해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');

    await repo.listReadyQueuedEntitlements(now);

    expect(entitlementFindMany).toHaveBeenCalledWith({
      where: {
        status: EntitlementStatus.QUEUED,
        startsAt: {
          lte: now,
        },
        endsAt: {
          gt: now,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { sequenceNo: 'asc' }],
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

  it('upsertIncludedCreditBucket는 전달된 sourceType과 무관하게 포함 크레딧 sourceType을 강제해야 한다', async () => {
    const data = {
      instructorId: 'instructor-1',
      paymentItemId: 'payment-item-1',
      entitlementId: 'entitlement-1',
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 1000,
      remainingAmount: 1000,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-04-23T14:59:59.999Z'),
    };

    await repo.upsertIncludedCreditBucket(data as never);

    expect(creditBucketUpsert).toHaveBeenCalledWith({
      where: {
        entitlementId_sourceType: {
          entitlementId: 'entitlement-1',
          sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
        },
      },
      create: {
        ...data,
        sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      },
      update: {
        sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
        originalAmount: 1000,
        remainingAmount: 1000,
        expiresAt: new Date('2026-04-23T14:59:59.999Z'),
        status: CreditBucketStatus.ACTIVE,
      },
    });
  });

  it('upsertRechargeCreditBucket는 전달된 sourceType과 무관하게 충전권 sourceType을 강제해야 한다', async () => {
    const data = {
      instructorId: 'instructor-1',
      paymentItemId: 'payment-item-1',
      entitlementId: null,
      sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 3000,
      remainingAmount: 3000,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-06-22T14:59:59.999Z'),
    };

    await repo.upsertRechargeCreditBucket(data as never);

    expect(creditBucketUpsert).toHaveBeenCalledWith({
      where: {
        paymentItemId_sourceType: {
          paymentItemId: 'payment-item-1',
          sourceType: CreditSourceType.RECHARGE_PACK,
        },
      },
      create: {
        ...data,
        sourceType: CreditSourceType.RECHARGE_PACK,
      },
      update: {
        sourceType: CreditSourceType.RECHARGE_PACK,
        originalAmount: 3000,
        remainingAmount: 3000,
        expiresAt: new Date('2026-06-22T14:59:59.999Z'),
        status: CreditBucketStatus.ACTIVE,
      },
    });
  });

  it('updatePayment는 expectedPreviousStatus가 있으면 상태가 일치할 때만 갱신해야 한다', async () => {
    paymentUpdateMany.mockResolvedValue({ count: 1 });
    paymentFindUnique.mockResolvedValue({
      id: 'payment-1',
      status: 'APPROVED',
    });

    await repo.updatePayment(
      'payment-1',
      {
        status: 'APPROVED',
      } as never,
      undefined,
      'PENDING_DEPOSIT',
    );

    expect(paymentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-1',
        status: 'PENDING_DEPOSIT',
      },
      data: {
        status: 'APPROVED',
      },
    });
    expect(paymentFindUnique).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
    });
    expect(paymentUpdate).not.toHaveBeenCalled();
  });

  it('findLatestPendingPassSinglePayment는 가장 최근 pending PASS_SINGLE 결제를 조회해야 한다', async () => {
    await repo.findLatestPendingPassSinglePayment('instructor-1');

    expect(paymentFindFirst).toHaveBeenCalledWith({
      where: {
        instructorId: 'instructor-1',
        status: PaymentStatus.PENDING_DEPOSIT,
        items: {
          some: {
            productTypeSnapshot: BillingProductType.PASS_SINGLE,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        createdAt: true,
        items: {
          select: {
            productNameSnapshot: true,
          },
          take: 1,
        },
      },
    });
  });
});
