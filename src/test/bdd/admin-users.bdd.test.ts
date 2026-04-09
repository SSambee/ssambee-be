import request from 'supertest';
import { fakerKO as faker } from '@faker-js/faker';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import { AdminProfileStatus, UserType } from '../../constants/auth.constant.js';
import * as mailUtil from '../../utils/mail.util.js';
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

    await prisma.admin.create({
      data: {
        userId: adminUser.id,
        status: AdminProfileStatus.ACTIVE,
        isPrimaryAdmin: true,
        invitedAt: new Date('2026-04-01T00:00:00.000Z'),
        activatedAt: new Date('2026-04-01T00:00:00.000Z'),
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

    const activeInstructor = await prisma.instructor.create({
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

    const assistantUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'active-assistant@example.com',
        name: '활성 조교',
        userType: UserType.ASSISTANT,
        role: 'assistant',
        emailVerified: true,
        createdAt: new Date('2026-03-10T00:00:00.000Z'),
        updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      },
    });

    const studentUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'student@example.com',
        name: '학생 사용자',
        userType: UserType.STUDENT,
        role: 'student',
        emailVerified: true,
        createdAt: new Date('2026-03-20T00:00:00.000Z'),
        updatedAt: new Date('2026-03-20T00:00:00.000Z'),
      },
    });

    const parentUser = await prisma.user.create({
      data: {
        id: faker.string.uuid(),
        email: 'parent@example.com',
        name: '학부모 사용자',
        userType: UserType.PARENT,
        role: 'parent',
        emailVerified: true,
        createdAt: new Date('2026-03-15T00:00:00.000Z'),
        updatedAt: new Date('2026-03-15T00:00:00.000Z'),
      },
    });

    await prisma.assistant.create({
      data: {
        userId: assistantUser.id,
        instructorId: activeInstructor.id,
        name: '활성 조교',
        phoneNumber: '010-4444-4444',
        signStatus: 'SIGNED',
      },
    });

    await prisma.appStudent.create({
      data: {
        userId: studentUser.id,
        phoneNumber: '010-5555-5555',
        parentPhoneNumber: '010-6666-6666',
        school: '테스트 고등학교',
        schoolYear: '2',
      },
    });

    await prisma.appParent.create({
      data: {
        userId: parentUser.id,
        phoneNumber: '010-6666-6666',
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

    await prisma.session.create({
      data: {
        id: faker.string.uuid(),
        token: faker.string.alphanumeric(20),
        userId: assistantUser.id,
        createdAt: new Date('2026-03-15T00:00:00.000Z'),
        updatedAt: new Date('2026-03-15T00:00:00.000Z'),
        expiresAt: new Date('2026-04-12T00:00:00.000Z'),
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

  it('관리자가 비어드민 전체 사용자 목록과 통계를 조회할 수 있어야 한다', async () => {
    mockAdminSession();

    const usersRes = await request(app).get('/api/admin/v1/users');

    expect(usersRes.status).toBe(200);
    expect(usersRes.body.message).toBe('관리자 사용자 목록 조회 성공');
    expect(usersRes.body.data.totalCount).toBe(6);
    expect(usersRes.body.data.users).toHaveLength(6);
    expect(usersRes.body.data.users[0].name).toBe('활성 강사');
    expect(usersRes.body.data.users[0].hasActiveSession).toBe(true);
    expect(usersRes.body.data.users[0].activityStatus).toBe('active_30d');
    expect(usersRes.body.data.users[0].userType).toBe(UserType.INSTRUCTOR);
    expect(
      usersRes.body.data.users.every(
        (user: { userType: string }) => user.userType !== UserType.ADMIN,
      ),
    ).toBe(true);

    const inactiveUsersRes = await request(app).get(
      '/api/admin/v1/users?activityStatus=inactive_30d&sessionStatus=inactive',
    );

    expect(inactiveUsersRes.status).toBe(200);
    expect(inactiveUsersRes.body.data.totalCount).toBe(4);
    expect(inactiveUsersRes.body.data.users).toHaveLength(4);
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

    const assistantOnlyRes = await request(app).get(
      `/api/admin/v1/users?userType=${UserType.ASSISTANT}`,
    );

    expect(assistantOnlyRes.status).toBe(200);
    expect(assistantOnlyRes.body.data.totalCount).toBe(1);
    expect(assistantOnlyRes.body.data.users).toHaveLength(1);
    expect(assistantOnlyRes.body.data.users[0]).toEqual(
      expect.objectContaining({
        name: '활성 조교',
        userType: UserType.ASSISTANT,
        phoneNumber: '010-4444-4444',
      }),
    );

    const statsRes = await request(app).get('/api/admin/v1/users/stats');

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.message).toBe('관리자 사용자 통계 조회 성공');
    expect(statsRes.body.data.totalCount).toBe(6);
    expect(statsRes.body.data.active30dCount).toBe(2);
    expect(statsRes.body.data.inactive30dCount).toBe(4);
    expect(statsRes.body.data.activeSessionCount).toBe(2);

    const assistantStatsRes = await request(app).get(
      `/api/admin/v1/users/stats?userType=${UserType.ASSISTANT}`,
    );

    expect(assistantStatsRes.status).toBe(200);
    expect(assistantStatsRes.body.data.totalCount).toBe(1);
    expect(assistantStatsRes.body.data.active30dCount).toBe(1);
    expect(assistantStatsRes.body.data.inactive30dCount).toBe(0);
    expect(assistantStatsRes.body.data.activeSessionCount).toBe(1);
  });

  it('최초 관리자가 추가 관리자 초대를 생성할 수 있어야 한다', async () => {
    mockAdminSession();
    jest
      .spyOn(mailUtil, 'sendAdminInvitationMail')
      .mockResolvedValue(undefined);

    const inviteRes = await request(app)
      .post('/api/admin/v1/admins/invitations')
      .send({
        email: 'invited-admin@example.com',
        name: '추가 관리자',
      });

    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.message).toBe('관리자 초대 메일을 전송했습니다.');
    expect(inviteRes.body.data.email).toBe('invited-admin@example.com');
    expect(inviteRes.body.data.resent).toBe(false);

    const invitedUser = await prisma.user.findUnique({
      where: { email: 'invited-admin@example.com' },
    });
    expect(invitedUser).not.toBeNull();

    const invitedAdmin = await prisma.admin.findUnique({
      where: { userId: invitedUser!.id },
    });
    expect(invitedAdmin).toEqual(
      expect.objectContaining({
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: false,
        invitedByUserId: adminUser.id,
      }),
    );
  });
});
