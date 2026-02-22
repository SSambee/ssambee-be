import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import {
  UserType,
  SIGNUP_PENDING_USER_TYPE,
} from '../../constants/auth.constant.js';
import {
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '../../err/http.exception.js';
import { mockUsers, mockSession, mockProfiles } from '../fixtures/index.js';

describe('Auth BDD Tests - @integration', () => {
  const app = createTestApp({ useRouter: true });
  const authService = container.authService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Scenario: Student Sign-up Flow
   * Given: An unauthenticated student
   * When: the student requests email verification with a valid email
   * Then: a verification OTP should be sent
   * When: the student verifies the OTP
   * Then: they should receive a temporary session
   * When: the student completes sign-up with their profile data
   * Then: a student profile should be created and they should be logged in
   */
  describe('Scenario: Student Sign-up Flow', () => {
    const studentEmail = 'student@example.com';
    const otp = '123456';

    it('should complete the sign-up flow successfully', async () => {
      // 1. [Given/When] Request email verification
      const requestEmailSpy = jest
        .spyOn(authService, 'requestEmailVerification')
        .mockResolvedValue({ status: true });

      const res1 = await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email: studentEmail });

      // [Then] Verification OTP sent
      expect(res1.status).toBe(200);
      expect(res1.body.message).toContain('이메일 인증코드를 전송했습니다');
      expect(requestEmailSpy).toHaveBeenCalledWith(studentEmail);

      // 2. [When] Verify OTP
      const verifyEmailSpy = jest
        .spyOn(authService, 'verifyEmailVerification')
        .mockResolvedValue({
          user: {
            ...mockUsers.student,
            userType: SIGNUP_PENDING_USER_TYPE,
          } as any,
          session: { token: 'temp-token' } as any,
          setCookie: 'session_token=temp-cookie',
        });

      const res2 = await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email: studentEmail, otp });

      // [Then] Received temporary session cookie
      expect(res2.status).toBe(200);
      expect(res2.header['set-cookie']).toBeDefined();
      expect(verifyEmailSpy).toHaveBeenCalledWith(studentEmail, otp);

      // 3. [When] Complete sign-up
      const completeSignUpSpy = jest
        .spyOn(authService, 'completeSignUpWithVerifiedEmail')
        .mockResolvedValue({
          user: mockUsers.student,
          session: mockSession,
          profile: mockProfiles.student,
          setCookie: 'session_token=final-cookie',
        });

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
        .set('Cookie', res2.header['set-cookie'])
        .send(signUpData);

      // [Then] Student profile created and logged in
      expect(res3.status).toBe(201);
      expect(res3.body.data.user.userType).toBe(UserType.STUDENT);
      expect(res3.body.data.profile).toBeDefined();
      expect(completeSignUpSpy).toHaveBeenCalled();
    });

    it('should fail if email is already verified by another type', async () => {
      // Mocking already signed up user
      jest
        .spyOn(authService, 'completeSignUpWithVerifiedEmail')
        .mockRejectedValue(
          new ForbiddenException('이미 회원가입이 완료된 계정입니다.'),
        );

      const res = await request(app)
        .post('/api/svc/v1/auth/student/signup')
        .set('Cookie', 'session_token=some-cookie')
        .send({
          email: studentEmail,
          password: 'Password123!',
          name: 'Student Name',
          phoneNumber: '010-1234-5678',
          parentPhoneNumber: '010-8765-4321',
          school: 'Test School',
          schoolYear: '고3',
        });

      expect(res.status).toBe(403); // Service throws ForbiddenException
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('이미 회원가입이 완료된 계정입니다');
    });
  });

  /**
   * Scenario: Assistant Sign-up Flow
   * Given: An unauthenticated person with a valid signup code
   * When: they request email verification
   * Then: OTP sent
   * When: they verify OTP
   * Then: temporary session received
   * When: they complete sign-up with a valid signup code
   * Then: an assistant profile should be created
   */
  describe('Scenario: Assistant Sign-up Flow', () => {
    const email = 'assistant@example.com';
    const otp = '123456';
    const signupCode = 'VALID-CODE';

    it('should complete the assistant sign-up flow successfully', async () => {
      // 1. Verification Request
      jest
        .spyOn(authService, 'requestEmailVerification')
        .mockResolvedValue({ status: true });
      await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email });

      // 2. OTP Verification
      jest.spyOn(authService, 'verifyEmailVerification').mockResolvedValue({
        user: { email, userType: SIGNUP_PENDING_USER_TYPE } as any,
        session: { token: 'temp' } as any,
        setCookie: 'session_token=temp',
      });
      const res2 = await request(app)
        .post('/api/public/v1/auth/email-verification')
        .send({ email, otp });

      // 3. Complete Sign-up
      const completeSpy = jest
        .spyOn(authService, 'completeSignUpWithVerifiedEmail')
        .mockResolvedValue({
          user: { ...mockUsers.assistant, email },
          session: mockSession,
          profile: mockProfiles.assistant,
          setCookie: 'session_token=final',
        });

      const signUpData = {
        email,
        password: 'AssistantPassword123!',
        name: 'Assistant Name',
        phoneNumber: '010-9999-8888',
        signupCode: signupCode,
      };

      const res3 = await request(app)
        .post('/api/mgmt/v1/auth/assistant/signup')
        .set('Cookie', res2.header['set-cookie'])
        .send(signUpData);

      expect(res3.status).toBe(201);
      expect(res3.body.data.user.userType).toBe(UserType.ASSISTANT);
      expect(completeSpy).toHaveBeenCalledWith(
        UserType.ASSISTANT,
        expect.objectContaining({ signupCode }),
        expect.anything(),
      );
    });

    it('should fail with invalid signup code', async () => {
      jest
        .spyOn(authService, 'completeSignUpWithVerifiedEmail')
        .mockRejectedValue(
          new BadRequestException('유효하지 않은 코드입니다.'),
        );

      const res = await request(app)
        .post('/api/mgmt/v1/auth/assistant/signup')
        .set('Cookie', 'session_token=temp')
        .send({
          email,
          password: 'AssistantPassword123!',
          name: 'Name',
          phoneNumber: '010-0000-0000',
          signupCode: 'INVALID',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('유효하지 않은 코드');
    });
  });

  /**
   * Scenario: Login Flow
   * Given: A registered instructor
   * When: they login with correct credentials
   * Then: they should receive a session cookie
   * When: they request their session info
   * Then: they should receive their profile data
   */
  describe('Scenario: Login Flow', () => {
    const loginData = {
      email: mockUsers.instructor.email,
      password: 'correctPassword123!',
      userType: UserType.INSTRUCTOR,
    };

    it('should login and retrieve session successfully', async () => {
      // 1. [When] Login
      const signInSpy = jest.spyOn(authService, 'signIn').mockResolvedValue({
        user: mockUsers.instructor,
        session: mockSession,
        profile: mockProfiles.instructor,
        setCookie: 'session_token=login-cookie',
      });

      const res1 = await request(app)
        .post('/api/public/v1/auth/signin')
        .send(loginData);

      // [Then] Success and cookie received
      expect(res1.status).toBe(200);
      expect(res1.header['set-cookie']).toBeDefined();
      expect(signInSpy).toHaveBeenCalled();

      // 2. [When] Get Session
      jest.spyOn(authService, 'getSession').mockResolvedValue({
        user: mockUsers.instructor,
        session: mockSession,
        profile: mockProfiles.instructor,
      });

      const res2 = await request(app)
        .get('/api/public/v1/auth/session')
        .set('Cookie', res1.header['set-cookie']);

      // [Then] Profile data received
      expect(res2.status).toBe(200);
      expect(res2.body.data.user.email).toBe(mockUsers.instructor.email);
      expect(res2.body.data.profile).toBeDefined();
    });

    it('should fail with incorrect password', async () => {
      jest
        .spyOn(authService, 'signIn')
        .mockRejectedValue(
          new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.'),
        );

      const res = await request(app)
        .post('/api/public/v1/auth/signin')
        .send({ ...loginData, password: 'wrongPassword123!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('올바르지 않습니다');
    });
  });
});
