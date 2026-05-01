import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { UserType } from '../src/constants/auth.constant.js';
import { EnrollmentStatus } from '../src/constants/enrollments.constant.js';
import { LectureStatus } from '../src/constants/lectures.constant.js';
import {
  BillingProductType,
  BillingMode,
  PaymentMethodType,
  PaymentProviderType,
  PaymentStatus,
} from '../src/constants/billing.constant.js';
import { v7 as uuidv7 } from 'uuid';
import { createId } from '@paralleldrive/cuid2';
import { hashPassword } from 'better-auth/crypto';
import 'dotenv/config';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const INSTRUCTOR_COUNT = 10;
const STUDENT_COUNT = 50;
const DEFAULT_PASSWORD = process.env.K6_TEST_PASSWORD || 'Test1234!';

async function cleanup() {
  console.log('🧹 Cleaning up k6 test data...');

  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'k6_' } },
    select: { id: true },
  });

  if (users.length === 0) {
    console.log('  No k6 accounts found.');
    return;
  }

  // Cascade deletes handle: Account, Instructor, AppStudent, Session,
  // Enrollment → LectureEnrollment, Lecture, Payment → PaymentItem → Entitlement
  for (const user of users) {
    await prisma.user.delete({ where: { id: user.id } });
  }

  // Clean up dangling BillingProduct/Payment created for k6
  await prisma.billingProduct.deleteMany({
    where: { code: { startsWith: 'K6_' } },
  });

  console.log(`  Deleted ${users.length} k6 users (cascade).`);
}

async function seed() {
  console.log('🌱 Seeding k6 test accounts...');
  const now = new Date();
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  // ── BillingProduct (dummy) ──────────────────────────────
  const billingProduct = await prisma.billingProduct.create({
    data: {
      id: createId(),
      code: 'K6_TEST_PLAN',
      name: '[k6] 테스트 이용권',
      productType: BillingProductType.PASS_SINGLE,
      billingMode: BillingMode.ONE_TIME,
      paymentMethodType: PaymentMethodType.BANK_TRANSFER,
      durationMonths: 12,
      includedCreditAmount: 9999,
      rechargeCreditAmount: 0,
      price: 0,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // ── Instructors ─────────────────────────────────────────
  const instructors: { id: string; lectureId: string }[] = [];

  for (let i = 1; i <= INSTRUCTOR_COUNT; i++) {
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: `k6_instructor_${i}@ssambee.co.kr`,
        name: `k6강사${i}`,
        userType: UserType.INSTRUCTOR,
        role: 'instructor',
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.account.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        accountId: user.email,
        providerId: 'credential',
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    });

    const instructor = await prisma.instructor.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        phoneNumber: `010-0000-${1000 + i}`,
        subject: '테스트',
        createdAt: now,
        updatedAt: now,
      },
    });

    const lecture = await prisma.lecture.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        title: `[k6] 테스트 강의 ${i}`,
        subject: '테스트',
        schoolYear: '고1',
        status: LectureStatus.IN_PROGRESS,
        startAt: new Date('2026-01-01T00:00:00.000Z'),
        endAt: new Date('2026-12-31T23:59:59.000Z'),
        createdAt: now,
        updatedAt: now,
      },
    });

    // Payment → PaymentItem → Entitlement (ACTIVE)
    const payment = await prisma.payment.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        methodType: PaymentMethodType.BANK_TRANSFER,
        providerType: PaymentProviderType.MANUAL,
        status: PaymentStatus.APPROVED,
        totalAmount: 0,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    const paymentItem = await prisma.paymentItem.create({
      data: {
        id: createId(),
        paymentId: payment.id,
        billingProductId: billingProduct.id,
        productCodeSnapshot: 'K6_TEST_PLAN',
        productNameSnapshot: '[k6] 테스트 이용권',
        productTypeSnapshot: BillingProductType.PASS_SINGLE,
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        durationMonthsSnapshot: 12,
        includedCreditAmountSnapshot: 9999,
        rechargeCreditAmountSnapshot: 0,
      },
    });

    await prisma.entitlement.create({
      data: {
        id: createId(),
        instructorId: instructor.id,
        paymentItemId: paymentItem.id,
        sequenceNo: 1,
        status: 'ACTIVE',
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
        endsAt: new Date('2030-12-31T23:59:59.000Z'),
        activatedAt: now,
        includedCreditAmount: 9999,
      },
    });

    instructors.push({ id: instructor.id, lectureId: lecture.id });
    console.log(`  Instructor ${i}/${INSTRUCTOR_COUNT} created.`);
  }

  // ── Students ────────────────────────────────────────────
  // 모든 학생을 instructor_1에 Enrollment → LectureEnrollment 매핑
  const primaryInstructor = instructors[0];

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const phoneSuffix = String(i).padStart(4, '0');
    const user = await prisma.user.create({
      data: {
        id: uuidv7(),
        email: `k6_student_${i}@ssambee.co.kr`,
        name: `k6학생${i}`,
        userType: UserType.STUDENT,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    await prisma.account.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        accountId: user.email,
        providerId: 'credential',
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    });

    const studentProfile = await prisma.appStudent.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        phoneNumber: `010-0000-${phoneSuffix}`,
        parentPhoneNumber: '010-0000-9001',
        school: 'k6테스트고',
        schoolYear: '고1',
        createdAt: now,
        updatedAt: now,
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        id: createId(),
        instructorId: primaryInstructor.id,
        appStudentId: studentProfile.id,
        studentName: `k6학생${i}`,
        studentPhone: `010-0000-${phoneSuffix}`,
        parentPhone: '010-0000-9001',
        school: 'k6테스트고',
        schoolYear: '고1',
        status: EnrollmentStatus.ACTIVE,
      },
    });

    await prisma.lectureEnrollment.create({
      data: {
        id: createId(),
        lectureId: primaryInstructor.lectureId,
        enrollmentId: enrollment.id,
      },
    });

    if (i % 10 === 0) {
      console.log(`  Student ${i}/${STUDENT_COUNT} created.`);
    }
  }

  console.log('✅ k6 seed completed!');
  console.log(`  Instructors: ${INSTRUCTOR_COUNT}`);
  console.log(`  Students:    ${STUDENT_COUNT}`);
  console.log(`  Password:    ${DEFAULT_PASSWORD}`);
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const isCleanup = process.argv.includes('--cleanup');

  try {
    if (isCleanup) {
      await cleanup();
    } else {
      await seed();
    }
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
