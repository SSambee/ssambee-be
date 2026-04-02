import request from 'supertest';
import { fakerKO as faker } from '@faker-js/faker';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import { UserType } from '../../constants/auth.constant.js';
import type { User } from '../../generated/prisma/client.js';

describe('관리자 사용자 관리 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  let adminUser: User;

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
        expiresAt: new Date('2026-04-03T01:00:00.000Z'),
        token: 'admin-token',
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z'),
        userId: adminUser.id,
        ipAddress: null,
        userAgent: null,
      },
      profile: null,
    });
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-03T00:00:00.000Z'));
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
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    });

    const activeUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'active-instructor@example.com',
        name: '활성 강사',
        userType: UserType.INSTRUCTOR,
        role: 'instructor',
        emailVerified: true,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-01T00:00:00.000Z'),
      },
    });

    const inactiveUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'inactive-instructor@example.com',
        name: '비활성 강사',
        userType: UserType.INSTRUCTOR,
        role: 'instructor',
        emailVerified: true,
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        updatedAt: new Date('2026-02-01T00:00:00.000Z'),
      },
    });

    const noSessionUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'nosession-instructor@example.com',
        name: '미접속 강사',
        userType: UserType.INSTRUCTOR,
        role: 'instructor',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    await prisma.instructor.create({
      data: {
        userId: activeUser.id,
        phoneNumber: '010-1111-1111',
        academy: '활성 학원',
        subject: '수학',
      },
    });

    await prisma.instructor.create({
      data: {
        userId: inactiveUser.id,
        phoneNumber: '010-2222-2222',
        academy: '비활성 학원',
        subject: '영어',
      },
    });

    await prisma.instructor.create({
      data: {
        userId: noSessionUser.id,
        phoneNumber: '010-3333-3333',
        academy: '미접속 학원',
        subject: '과학',
      },
    });

    await prisma.session.create({
      data: {
        id: faker.string.uuid(),
        token: faker.string.alphanumeric(20),
        userId: activeUser.id,
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T12:00:00.000Z'),
        expiresAt: new Date('2026-04-10T00:00:00.000Z'),
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });

    await prisma.session.create({
      data: {
        id: faker.string.uuid(),
        token: faker.string.alphanumeric(20),
        userId: inactiveUser.id,
        createdAt: new Date('2026-02-20T00:00:00.000Z'),
        updatedAt: new Date('2026-02-21T00:00:00.000Z'),
        expiresAt: new Date('2026-02-28T00:00:00.000Z'),
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  it('관리자가 강사 사용자 목록과 통계를 조회할 수 있어야 한다', async () => {
    mockAdminSession();

    const usersRes = await request(app).get('/api/admin/v1/users');

    expect(usersRes.status).toBe(200);
    expect(usersRes.body.message).toBe('관리자 사용자 목록 조회 성공');
    expect(usersRes.body.data.totalCount).toBe(3);
    expect(usersRes.body.data.users).toHaveLength(3);
    expect(usersRes.body.data.users[0].name).toBe('활성 강사');
    expect(usersRes.body.data.users[0].hasActiveSession).toBe(true);
    expect(usersRes.body.data.users[0].activityStatus).toBe('active_30d');

    const inactiveUsersRes = await request(app).get(
      '/api/admin/v1/users?activityStatus=inactive_30d&sessionStatus=inactive',
    );

    expect(inactiveUsersRes.status).toBe(200);
    expect(inactiveUsersRes.body.data.totalCount).toBe(2);
    expect(inactiveUsersRes.body.data.users).toHaveLength(2);
    expect(
      inactiveUsersRes.body.data.users.every(
        (user: { activityStatus: string; hasActiveSession: boolean }) =>
          user.activityStatus === 'inactive_30d' &&
          user.hasActiveSession === false,
      ),
    ).toBe(true);

    const keywordRes = await request(app).get(
      '/api/admin/v1/users?keyword=010-1111',
    );

    expect(keywordRes.status).toBe(200);
    expect(keywordRes.body.data.totalCount).toBe(1);
    expect(keywordRes.body.data.users[0].name).toBe('활성 강사');

    const statsRes = await request(app).get('/api/admin/v1/users/stats');

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.message).toBe('관리자 사용자 통계 조회 성공');
    expect(statsRes.body.data.totalCount).toBe(3);
    expect(statsRes.body.data.active30dCount).toBe(1);
    expect(statsRes.body.data.inactive30dCount).toBe(2);
    expect(statsRes.body.data.activeSessionCount).toBe(1);
  });
});
