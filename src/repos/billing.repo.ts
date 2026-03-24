import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  CreditBucketStatus,
  EntitlementStatus,
} from '../constants/billing.constant.js';

interface PaymentListParams {
  status?: string;
  page: number;
  limit: number;
}

interface CreditLedgerListParams {
  page: number;
  limit: number;
}

export class BillingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  async listActiveProducts() {
    return this.prisma.billingProduct.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async listProducts() {
    return this.prisma.billingProduct.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findProductById(id: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).billingProduct.findUnique({
      where: { id },
    });
  }

  async createProduct(
    data: Prisma.BillingProductUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).billingProduct.create({ data });
  }

  async updateProduct(
    id: string,
    data: Prisma.BillingProductUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).billingProduct.update({
      where: { id },
      data,
    });
  }

  async createPayment(
    data: Prisma.PaymentUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).payment.create({ data });
  }

  async updatePayment(
    id: string,
    data: Prisma.PaymentUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).payment.update({
      where: { id },
      data,
    });
  }

  async createPaymentItem(
    data: Prisma.PaymentItemUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).paymentItem.create({ data });
  }

  async createPaymentStatusHistory(
    data: Prisma.PaymentStatusHistoryUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).paymentStatusHistory.create({ data });
  }

  async createReceiptRequest(
    data: Prisma.PaymentReceiptRequestUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).paymentReceiptRequest.create({ data });
  }

  async updateReceiptRequest(
    id: string,
    data: Prisma.PaymentReceiptRequestUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).paymentReceiptRequest.update({
      where: { id },
      data,
    });
  }

  async findReceiptRequestById(id: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).paymentReceiptRequest.findUnique({
      where: { id },
      include: {
        payment: {
          include: {
            instructor: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findPaymentById(id: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).payment.findUnique({
      where: { id },
      include: {
        instructor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        items: {
          include: {
            billingProduct: true,
            entitlements: true,
            creditBuckets: true,
          },
        },
        receiptRequest: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async listInstructorPayments(
    instructorId: string,
    { status, page, limit }: PaymentListParams,
  ) {
    const where: Prisma.PaymentWhereInput = {
      instructorId,
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * limit;

    const [payments, totalCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          items: true,
          receiptRequest: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { payments, totalCount };
  }

  async listPayments({ status, page, limit }: PaymentListParams) {
    const where: Prisma.PaymentWhereInput = status ? { status } : {};
    const skip = (page - 1) * limit;

    const [payments, totalCount] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          instructor: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          items: true,
          receiptRequest: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { payments, totalCount };
  }

  async listEntitlementsByInstructor(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.findMany({
      where: { instructorId },
      orderBy: [{ startsAt: 'asc' }, { sequenceNo: 'asc' }],
      include: {
        paymentItem: {
          include: {
            payment: true,
          },
        },
        creditBuckets: true,
      },
    });
  }

  async findLatestEntitlement(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.findFirst({
      where: {
        instructorId,
        status: {
          in: [EntitlementStatus.ACTIVE, EntitlementStatus.QUEUED],
        },
      },
      orderBy: [{ endsAt: 'desc' }, { sequenceNo: 'desc' }],
    });
  }

  async findActiveEntitlement(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.findFirst({
      where: {
        instructorId,
        status: EntitlementStatus.ACTIVE,
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async findReadyQueuedEntitlement(
    instructorId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.findFirst({
      where: {
        instructorId,
        status: EntitlementStatus.QUEUED,
        startsAt: {
          lte: now,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { sequenceNo: 'asc' }],
    });
  }

  async listReadyQueuedEntitlements(now: Date, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).entitlement.findMany({
      where: {
        status: EntitlementStatus.QUEUED,
        startsAt: {
          lte: now,
        },
      },
      orderBy: [{ startsAt: 'asc' }, { sequenceNo: 'asc' }],
    });
  }

  async listEntitlementsToExpire(now: Date, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).entitlement.findMany({
      where: {
        status: EntitlementStatus.ACTIVE,
        endsAt: {
          lt: now,
        },
      },
      orderBy: { endsAt: 'asc' },
    });
  }

  async createEntitlement(
    data: Prisma.EntitlementUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.create({ data });
  }

  async updateEntitlement(
    id: string,
    data: Prisma.EntitlementUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).entitlement.update({
      where: { id },
      data,
    });
  }

  async findCreditWalletByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditWallet.findUnique({
      where: { instructorId },
    });
  }

  async upsertCreditWallet(
    instructorId: string,
    data: Omit<Prisma.CreditWalletUncheckedCreateInput, 'instructorId'>,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditWallet.upsert({
      where: { instructorId },
      create: {
        instructorId,
        ...data,
      },
      update: data,
    });
  }

  async upsertIncludedCreditBucket(
    data: Prisma.CreditBucketUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    if (!data.entitlementId) {
      throw new Error('entitlementId is required for included credit bucket');
    }

    return this.getClient(tx).creditBucket.upsert({
      where: {
        entitlementId_sourceType: {
          entitlementId: data.entitlementId,
          sourceType: data.sourceType,
        },
      },
      create: data,
      update: {
        originalAmount: data.originalAmount,
        remainingAmount: data.remainingAmount,
        expiresAt: data.expiresAt,
        status: data.status,
      },
    });
  }

  async findIncludedCreditBucketByEntitlementId(
    entitlementId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditBucket.findUnique({
      where: {
        entitlementId_sourceType: {
          entitlementId,
          sourceType: 'ENTITLEMENT_INCLUDED',
        },
      },
    });
  }

  async upsertRechargeCreditBucket(
    data: Prisma.CreditBucketUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    if (!data.paymentItemId) {
      throw new Error('paymentItemId is required for recharge credit bucket');
    }

    return this.getClient(tx).creditBucket.upsert({
      where: {
        paymentItemId_sourceType: {
          paymentItemId: data.paymentItemId,
          sourceType: data.sourceType,
        },
      },
      create: data,
      update: {
        originalAmount: data.originalAmount,
        remainingAmount: data.remainingAmount,
        expiresAt: data.expiresAt,
        status: data.status,
      },
    });
  }

  async findRechargeCreditBucketByPaymentItemId(
    paymentItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditBucket.findUnique({
      where: {
        paymentItemId_sourceType: {
          paymentItemId,
          sourceType: 'RECHARGE_PACK',
        },
      },
    });
  }

  async listActiveCreditBuckets(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditBucket.findMany({
      where: {
        instructorId,
        status: CreditBucketStatus.ACTIVE,
        remainingAmount: {
          gt: 0,
        },
      },
      orderBy: [{ expiresAt: 'asc' }, { grantedAt: 'asc' }, { id: 'asc' }],
    });
  }

  async listCreditBucketsToExpire(now: Date, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).creditBucket.findMany({
      where: {
        status: CreditBucketStatus.ACTIVE,
        expiresAt: {
          lt: now,
        },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async updateCreditBucket(
    id: string,
    data: Prisma.CreditBucketUncheckedUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditBucket.update({
      where: { id },
      data,
    });
  }

  async createCreditLedger(
    data: Prisma.CreditLedgerUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).creditLedger.create({ data });
  }

  async createCreditLedgers(
    data: Prisma.CreditLedgerUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ) {
    if (data.length === 0) {
      return;
    }

    await this.getClient(tx).creditLedger.createMany({ data });
  }

  async listCreditLedgersByInstructor(
    instructorId: string,
    { page, limit }: CreditLedgerListParams,
  ) {
    const skip = (page - 1) * limit;

    const [ledgers, totalCount] = await this.prisma.$transaction([
      this.prisma.creditLedger.findMany({
        where: { instructorId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.creditLedger.count({
        where: { instructorId },
      }),
    ]);

    return { ledgers, totalCount };
  }
}
