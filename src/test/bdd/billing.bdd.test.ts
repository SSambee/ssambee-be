import request from 'supertest';
import { fakerKO as faker } from '@faker-js/faker';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import {
  BillingMode,
  BillingProductType,
  BillingSystemProductCode,
  PaymentMethodType,
  PaymentRefundStatus,
  PaymentStatus,
} from '../../constants/billing.constant.js';
import { UserType } from '../../constants/auth.constant.js';
import { calculateCreditExpiryAt } from '../../utils/date.util.js';
import type {
  BillingProduct,
  Instructor,
  User,
} from '../../generated/prisma/client.js';

describe('결제 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  let adminUser: User;
  let instructorUser: User;
  let instructor: Instructor;
  let adminGrantProduct: BillingProduct;

  const mockAdminSession = () => {
    jest.spyOn(container.authService, 'getSession').mockResolvedValue({
      user: {
        id: adminUser.id,
        email: adminUser.email,
        userType: UserType.ADMIN,
        name: adminUser.name,
        role: 'admin',
      },
      session: {
        id: 'admin-session',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        token: 'admin-token',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: adminUser.id,
        ipAddress: null,
        userAgent: null,
      },
      profile: null,
    });
  };

  const mockInstructorSession = () => {
    jest.spyOn(container.authService, 'getSession').mockResolvedValue({
      user: {
        id: instructorUser.id,
        email: instructorUser.email,
        userType: UserType.INSTRUCTOR,
        name: instructorUser.name,
      },
      session: {
        id: 'instructor-session',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        token: 'instructor-token',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: instructorUser.id,
        ipAddress: null,
        userAgent: null,
      },
      profile: instructor,
    });
  };

  beforeEach(async () => {
    await dbTestUtil.truncateAll();
    jest.clearAllMocks();

    adminUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: faker.internet.email(),
        name: '관리자',
        userType: UserType.ADMIN,
        role: 'admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    instructorUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: faker.internet.email(),
        name: '강사',
        userType: UserType.INSTRUCTOR,
        role: 'instructor',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    instructor = await prisma.instructor.create({
      data: {
        userId: instructorUser.id,
        phoneNumber: faker.phone.number(),
      },
    });

    adminGrantProduct = await prisma.billingProduct.create({
      data: {
        code: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
        name: '관리자 지급 전용 충전권',
        description: '관리자가 강사에게 직접 지급하는 0원 충전권',
        productType: BillingProductType.CREDIT_PACK,
        billingMode: BillingMode.ONE_TIME,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        durationMonths: null,
        includedCreditAmount: 0,
        rechargeCreditAmount: 1,
        price: 0,
        isActive: false,
        sortOrder: 9999,
      },
    });
  });

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  it('관리자가 0원 충전권을 지급하면 실제 API 응답과 강사 조회 결과에 반영되어야 한다', async () => {
    mockAdminSession();

    const createRes = await request(app)
      .post(`/api/admin/v1/billing/instructors/${instructor.id}/credit-grants`)
      .send({
        creditAmount: 1500,
        expiresInDays: 30,
        reason: '운영 보상',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('success');
    expect(createRes.body.message).toBe('관리자 크레딧 지급 성공');
    expect(createRes.body.data.status).toBe(PaymentStatus.APPROVED);
    expect(createRes.body.data.totalAmount).toBe(0);
    expect(createRes.body.data.refundStatus).toBe(PaymentRefundStatus.NONE);
    expect(createRes.body.data.items).toHaveLength(1);
    expect(createRes.body.data.items[0].billingProductId).toBe(
      adminGrantProduct.id,
    );
    expect(createRes.body.data.items[0].productCodeSnapshot).toBe(
      BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
    );
    expect(createRes.body.data.items[0].rechargeCreditAmountSnapshot).toBe(
      1500,
    );
    expect(createRes.body.data.items[0].rechargeExpiresInDaysSnapshot).toBe(30);
    expect(createRes.body.data.items[0].creditBuckets).toHaveLength(1);
    expect(createRes.body.data.items[0].creditBuckets[0].remainingAmount).toBe(
      1500,
    );
    expect(createRes.body.data.items[0].creditBuckets[0].expiresAt).toBe(
      calculateCreditExpiryAt(
        new Date(createRes.body.data.approvedAt),
        30,
      ).toISOString(),
    );

    const savedPayment = await prisma.payment.findUnique({
      where: { id: createRes.body.data.id },
      include: {
        items: {
          include: {
            creditBuckets: true,
          },
        },
        statusHistory: true,
      },
    });

    expect(savedPayment).not.toBeNull();
    expect(savedPayment?.status).toBe(PaymentStatus.APPROVED);
    expect(savedPayment?.totalAmount).toBe(0);
    expect(savedPayment?.statusHistory).toHaveLength(1);
    expect(savedPayment?.statusHistory[0].reason).toBe('운영 보상');
    expect(savedPayment?.items[0].rechargeExpiresInDaysSnapshot).toBe(30);
    expect(savedPayment?.items[0].creditBuckets[0].remainingAmount).toBe(1500);

    mockInstructorSession();

    const paymentDetailRes = await request(app).get(
      `/api/mgmt/v1/billing/payments/${createRes.body.data.id}`,
    );

    expect(paymentDetailRes.status).toBe(200);
    expect(paymentDetailRes.body.data.id).toBe(createRes.body.data.id);
    expect(
      paymentDetailRes.body.data.items[0].rechargeExpiresInDaysSnapshot,
    ).toBe(30);

    const creditsRes = await request(app).get('/api/mgmt/v1/billing/credits');

    expect(creditsRes.status).toBe(200);
    expect(creditsRes.body.data.totalAvailable).toBe(1500);
  });

  it('관리자 지급 충전권은 API로 회수되지만 환불 상태 변경은 막아야 한다', async () => {
    mockAdminSession();

    const createRes = await request(app)
      .post(`/api/admin/v1/billing/instructors/${instructor.id}/credit-grants`)
      .send({
        creditAmount: 900,
        expiresInDays: 7,
        reason: '테스트 지급',
      });

    expect(createRes.status).toBe(201);

    const paymentId = createRes.body.data.id as string;
    const paymentItemId = createRes.body.data.items[0].id as string;

    const revokeRes = await request(app)
      .post(
        `/api/admin/v1/billing/payment-items/${paymentItemId}/revoke-recharge-credits`,
      )
      .send({
        reason: '오지급 회수',
      });

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.status).toBe('success');
    expect(revokeRes.body.message).toBe('충전 크레딧 회수 성공');
    expect(revokeRes.body.data.revokedRechargeAmount).toBe(900);
    expect(revokeRes.body.data.paymentId).toBe(paymentId);
    expect(revokeRes.body.data.payment.id).toBe(paymentId);
    expect(revokeRes.body.data.payment.refundStatus).toBe(
      PaymentRefundStatus.NONE,
    );
    expect(revokeRes.body.data.payment.hasRevocation).toBe(true);
    expect(revokeRes.body.data.payment.revokedRechargeAmount).toBe(900);

    const refundRes = await request(app)
      .patch(`/api/admin/v1/billing/payments/${paymentId}/refund-status`)
      .send({
        refundStatus: PaymentRefundStatus.COMPLETED,
        refundMemo: '처리 불가',
      });

    expect(refundRes.status).toBe(400);
    expect(refundRes.body.success).toBe(false);
    expect(refundRes.body.message).toBe(
      '관리자 지급 크레딧은 환불 상태를 변경할 수 없습니다.',
    );
  });
});
