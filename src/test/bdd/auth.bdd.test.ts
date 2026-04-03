import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import {
  AdminProfileStatus,
  UserType,
  SIGNUP_PENDING_USER_TYPE,
} from '../../constants/auth.constant.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import { fakerKO as faker } from '@faker-js/faker';
import { auth } from '../../config/auth.config.js';

describe('인증 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  beforeAll(async () => {});

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  beforeEach(async () => {
    await dbTestUtil.truncateAll();
    jest.clearAllMocks();
  });

  describe('시나리오: 학생 회원가입 플로우', () => {
    const studentEmail = 'student@example.com';
    const otp = '123456';

    it('회원가입 플로우가 성공적으로 완료되어야 한다', async () => {
      // 1. [Given/When] 이메일 인증 요청
      (auth.handler as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: true }), { status: 200 }),
        ),
      );

      const res1 = await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email: studentEmail });

      expect(res1.status).toBe(200);

      // 2. [When] OTP 인증
      const tempUserId = faker.string.uuid();
      (auth.handler as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: tempUserId,
                email: studentEmail,
                name: 'Temp',
                userType: SIGNUP_PENDING_USER_TYPE,
              },
              session: {
                id: 'temp-session',
                token: 'temp-token',
                expiresAt: new Date(Date.now() + 3600000),
              },
            }),
            {
              status: 200,
              headers: {
                'set-cookie':
                  'ssambee-auth.session_token=temp-cookie; Path=/; HttpOnly',
              },
            },
          ),
        ),
      );

      const res2 = await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email: studentEmail, otp });

      expect(res2.status).toBe(200);

      // 3. [When] 회원가입 완료
      await prisma.user.create({
        data: {
          id: tempUserId,
          email: studentEmail,
          name: 'Temp',
          userType: SIGNUP_PENDING_USER_TYPE,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: {
          id: tempUserId,
          email: studentEmail,
          userType: SIGNUP_PENDING_USER_TYPE,
          name: 'Temp',
        },
        session: { id: 'temp-session' },
      });

      // update-user 등을 위해 handler가 다시 호출될 수 있으므로 새 Response 반환
      (auth.handler as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: true }), { status: 200 }),
        ),
      );

      const signUpData = {
        email: studentEmail,
        password: 'Password123!',
        name: 'Student Name',
        phoneNumber: '010-1234-5678',
        parentPhoneNumber: '010-8765-4321',
        school: 'Test School',
        schoolYear: '고3',
      };

      const res3 = await request(app)
        .post('/api/svc/v1/auth/student/signup')
        .set('Cookie', (res2.header['set-cookie'] as unknown as string[]) || [])
        .send(signUpData);

      expect(res3.status).toBe(201);

      const savedProfile = await prisma.appStudent.findFirst({
        where: { phoneNumber: signUpData.phoneNumber },
      });
      expect(savedProfile).toBeDefined();
    });
  });

  describe('시나리오: 조교 회원가입 플로우', () => {
    const email = 'assistant@example.com';
    const signupCode = 'VALID-CODE';

    it('조교 회원가입 플로우가 성공적으로 완료되어야 한다', async () => {
      const instructorUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: 'i@e.com',
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const instructor = await prisma.instructor.create({
        data: { userId: instructorUser.id, phoneNumber: '010-0000-0000' },
      });
      await prisma.assistantCode.create({
        data: {
          code: signupCode,
          instructorId: instructor.id,
          expireAt: new Date(Date.now() + 3600000),
        },
      });

      const tempUserId = faker.string.uuid();
      await prisma.user.create({
        data: {
          id: tempUserId,
          email,
          name: 'Temp',
          userType: SIGNUP_PENDING_USER_TYPE,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: {
          id: tempUserId,
          email,
          userType: SIGNUP_PENDING_USER_TYPE,
          name: 'Temp',
        },
        session: { id: 'temp-session' },
      });

      (auth.handler as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ status: true }), { status: 200 }),
        ),
      );

      const res = await request(app)
        .post('/api/mgmt/v1/auth/assistant/signup')
        .set('Cookie', 'ssambee-auth.session_token=valid-temp-token')
        .send({
          email,
          password: 'Password123!',
          name: 'Assistant Name',
          phoneNumber: '010-9999-8888',
          signupCode: signupCode,
        });

      expect(res.status).toBe(201);
      const savedAssistant = await prisma.assistant.findFirst({
        where: { userId: tempUserId },
      });
      expect(savedAssistant).toBeDefined();
    });
  });

  describe('시나리오: 로그인 플로우', () => {
    it('로그인이 성공적으로 수행되어야 한다', async () => {
      const email = 'login@example.com';
      const password = 'Password123!';
      const userId = faker.string.uuid();

      await prisma.user.create({
        data: {
          id: userId,
          email,
          name: 'Instructor',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const instructor = await prisma.instructor.create({
        data: { userId, phoneNumber: '010-1111-2222' },
      });

      (auth.handler as unknown as jest.Mock).mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: userId,
                email,
                name: 'Instructor',
                userType: UserType.INSTRUCTOR,
              },
              session: { id: 'session-id', token: 'token' },
            }),
            {
              status: 200,
              headers: {
                'set-cookie':
                  'ssambee-auth.session_token=login-token; Path=/; HttpOnly',
              },
            },
          ),
        ),
      );

      const res = await request(app)
        .post('/api/public/v1/auth/signin')
        .send({ email, password, userType: UserType.INSTRUCTOR });

      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(userId);
      expect(res.body.data.profile.id).toBe(instructor.id);
    });
  });

  describe('시나리오: 관리자 최초 활성화 플로우', () => {
    const adminEmail = 'primary-admin@example.com';
    const adminUserId = 'primary-admin-user-id';

    it('pending admin이 OTP 인증 후 비밀번호를 설정하고 로그인할 수 있어야 한다', async () => {
      await prisma.user.create({
        data: {
          id: adminUserId,
          email: adminEmail,
          name: 'Primary Admin',
          userType: UserType.ADMIN,
          role: 'admin',
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await prisma.admin.create({
        data: {
          userId: adminUserId,
          status: AdminProfileStatus.PENDING_ACTIVATION,
          isPrimaryAdmin: true,
          invitedAt: new Date(),
        },
      });

      (auth.handler as unknown as jest.Mock).mockImplementation((request) => {
        if (request.url.includes('/email-otp/send-verification-otp')) {
          return Promise.resolve(
            new Response(JSON.stringify({ status: true }), { status: 200 }),
          );
        }

        if (request.url.includes('/sign-in/email-otp')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: {
                  id: adminUserId,
                  email: adminEmail,
                  name: 'Primary Admin',
                  userType: UserType.ADMIN,
                  role: 'admin',
                },
                session: {
                  id: 'admin-otp-session',
                  token: 'admin-otp-token',
                  expiresAt: new Date(Date.now() + 3600000),
                },
              }),
              {
                status: 200,
                headers: {
                  'set-cookie':
                    'ssambee-auth.session_token=admin-otp-cookie; Path=/; HttpOnly',
                },
              },
            ),
          );
        }

        if (request.url.includes('/sign-in/email')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: {
                  id: adminUserId,
                  email: adminEmail,
                  name: 'Primary Admin',
                  userType: UserType.ADMIN,
                  role: 'admin',
                },
                session: { id: 'admin-session', token: 'admin-token' },
              }),
              {
                status: 200,
                headers: {
                  'set-cookie':
                    'ssambee-auth.session_token=admin-login-cookie; Path=/; HttpOnly',
                },
              },
            ),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({ status: true }), { status: 200 }),
        );
      });

      const requestOtpRes = await request(app)
        .post('/api/admin/v1/auth/activate/request-otp')
        .send({ email: adminEmail });

      expect(requestOtpRes.status).toBe(200);

      const verifyOtpRes = await request(app)
        .post('/api/admin/v1/auth/activate/verify-otp')
        .send({ email: adminEmail, otp: '123456' });

      expect(verifyOtpRes.status).toBe(200);
      expect(verifyOtpRes.body.data.activationRequired).toBe(true);

      (auth.api.getSession as unknown as jest.Mock).mockResolvedValue({
        user: {
          id: adminUserId,
          email: adminEmail,
          name: 'Primary Admin',
          userType: UserType.ADMIN,
          role: 'admin',
        },
        session: { id: 'admin-otp-session', token: 'admin-otp-token' },
      });
      (auth.api as typeof auth.api & { setPassword: jest.Mock }).setPassword =
        jest.fn().mockResolvedValue({ status: true });

      const completeRes = await request(app)
        .post('/api/admin/v1/auth/activate/complete')
        .set(
          'Cookie',
          (verifyOtpRes.header['set-cookie'] as unknown as string[]) || [],
        )
        .send({ password: 'Password123!' });

      expect(completeRes.status).toBe(200);

      const savedAdmin = await prisma.admin.findUnique({
        where: { userId: adminUserId },
      });
      expect(savedAdmin?.status).toBe(AdminProfileStatus.ACTIVE);
      expect(savedAdmin?.activatedAt).not.toBeNull();

      const loginRes = await request(app)
        .post('/api/admin/v1/auth/signin')
        .send({
          email: adminEmail,
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.id).toBe(adminUserId);
    });
  });
});
