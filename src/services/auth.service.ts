import type { IncomingHttpHeaders } from 'http';
import { createHash } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '../err/http.exception.js';
import {
  AdminProfileStatus,
  SIGNUP_PENDING_USER_TYPE,
  UserType,
} from '../constants/auth.constant.js';
import { auth } from '../config/auth.config.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { ParentRepository } from '../repos/parent.repo.js';
import { SignUpData, AuthResponse, AuthUser } from '../types/auth.types.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { config } from '../config/env.config.js';
import { BillingService } from './billing.service.js';
import { AdminRepository } from '../repos/admin.repo.js';

const hasAdminRole = (role?: string | string[] | null) => {
  if (!role) {
    return false;
  }

  if (Array.isArray(role)) {
    return role.includes('admin');
  }

  return role === 'admin';
};

export class AuthService {
  constructor(
    private readonly instructorRepo: InstructorRepository,
    private readonly assistantRepo: AssistantRepository,
    private readonly assistantCodeRepo: AssistantCodeRepository,
    private readonly studentRepo: StudentRepository,
    private readonly parentRepo: ParentRepository,
    private readonly adminRepo: AdminRepository,
    private readonly enrollmentsRepo: EnrollmentsRepository,
    private readonly authClient: typeof auth,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaClient,
  ) {}

  private readonly baseURL = config.BETTER_AUTH_URL;
  private readonly frontOrigin = config.FRONT_URL?.split(',')
    .map((url) => url.trim())
    .filter(Boolean)[0];

  private isSupportedUserType(value: string): value is UserType {
    return (Object.values(UserType) as string[]).includes(value);
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private getEmailLogToken(normalizedEmail: string) {
    return createHash('sha256')
      .update(normalizedEmail)
      .digest('hex')
      .slice(0, 12);
  }

  private getSetCookieHeaders(headers: Headers) {
    const headersWithGetSetCookie = headers as Headers & {
      getSetCookie?: () => string[];
    };

    if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
      const cookies = headersWithGetSetCookie.getSetCookie().filter(Boolean);
      if (cookies.length === 0) {
        return null;
      }

      return cookies.length === 1 ? cookies[0] : cookies;
    }

    const setCookie = headers.get('set-cookie');
    return setCookie || null;
  }

  private async getAdminOrThrow(userId: string) {
    const admin = await this.adminRepo.findByUserId(userId);

    if (!admin) {
      throw new ForbiddenException('관리자 계정 구성이 올바르지 않습니다.');
    }

    return admin;
  }

  private async ensureActiveAdminOrThrow(userId: string) {
    const admin = await this.getAdminOrThrow(userId);

    if (admin.status !== AdminProfileStatus.ACTIVE) {
      throw new ForbiddenException('관리자 최초 활성화가 필요합니다.');
    }

    return admin;
  }

  private async getAuthErrorMessage(response: Response, fallback: string) {
    try {
      const data = await response.json();
      if (
        data &&
        typeof data === 'object' &&
        'message' in data &&
        typeof data.message === 'string'
      ) {
        return data.message;
      }
    } catch (_error) {
      // no-op
    }
    return fallback;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    try {
      return (await response.json()) as T;
    } catch (_error) {
      throw new BadRequestException('서버 응답을 읽는 중 오류가 발생했습니다.');
    }
  }

  private toRequestHeaders(
    headers?: IncomingHttpHeaders,
    withJsonContentType: boolean = true,
  ) {
    const requestHeaders: Record<string, string> = {};

    if (withJsonContentType) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    if (!headers) {
      return requestHeaders;
    }

    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        requestHeaders[key] = value;
        return;
      }

      if (Array.isArray(value)) {
        requestHeaders[key] = value.join('; ');
      }
    });

    // Better Auth origin check:
    // cookie가 포함된 민감 요청은 Origin/Referer가 없으면 차단된다.
    if (
      requestHeaders.cookie &&
      !requestHeaders.origin &&
      !requestHeaders.referer
    ) {
      requestHeaders.origin = this.frontOrigin || this.baseURL;
    }

    return requestHeaders;
  }

  private async callAuthHandler<T>({
    path,
    method,
    body,
    headers,
    fallbackErrorMessage,
  }: {
    path: string;
    method: 'GET' | 'POST';
    body?: unknown;
    headers?: IncomingHttpHeaders;
    fallbackErrorMessage: string;
  }) {
    const request = new Request(`${this.baseURL}/api/auth${path}`, {
      method,
      headers: this.toRequestHeaders(headers),
      body: body ? JSON.stringify(body) : undefined,
    });

    const response = await this.authClient.handler(request);
    if (!response.ok) {
      const message = await this.getAuthErrorMessage(
        response,
        fallbackErrorMessage,
      );
      throw new BadRequestException(message);
    }

    const data = (await response.json()) as T;
    const setCookie = this.getSetCookieHeaders(response.headers);

    return { data, setCookie };
  }

  private isBetterAuthAlreadyHasPasswordError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as Record<string, unknown>;
    const code = err.code ?? (err.error as Record<string, unknown>)?.code;
    const type = err.type ?? (err.error as Record<string, unknown>)?.type;
    const message =
      err.message ?? (err.error as Record<string, unknown>)?.message;

    if (
      code === 'USER_ALREADY_HAS_PASSWORD' ||
      type === 'USER_ALREADY_HAS_PASSWORD'
    ) {
      return true;
    }

    if (
      err.name === 'BetterAuthError' ||
      err.constructor?.name === 'BetterAuthError'
    ) {
      if (message === 'user already has a password') {
        return true;
      }
    }

    if (
      typeof message === 'string' &&
      message === 'user already has a password'
    ) {
      return true;
    }

    return false;
  }

  private async ensureCredentialPassword(
    userId: string,
    headers: IncomingHttpHeaders,
    newPassword: string,
  ) {
    const credentialAccount = await this.prisma.account.findFirst({
      where: {
        userId,
        providerId: 'credential',
      },
      select: {
        id: true,
        password: true,
      },
    });

    if (credentialAccount?.password) {
      return;
    }

    const setPasswordApi = this.authClient.api as {
      setPassword?: (input: {
        headers: ReturnType<typeof fromNodeHeaders>;
        body: { newPassword: string };
      }) => Promise<unknown>;
    };

    try {
      if (typeof setPasswordApi.setPassword === 'function') {
        await setPasswordApi.setPassword({
          headers: fromNodeHeaders(headers),
          body: { newPassword },
        });
        return;
      }
    } catch (error) {
      if (this.isBetterAuthAlreadyHasPasswordError(error)) {
        return;
      }
      const message =
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : '비밀번호 설정에 실패했습니다.';
      throw new BadRequestException(message);
    }

    try {
      await this.callAuthHandler<{ status: boolean }>({
        path: '/set-password',
        method: 'POST',
        headers,
        body: { newPassword },
        fallbackErrorMessage: '비밀번호 설정에 실패했습니다.',
      });
    } catch (error) {
      if (this.isBetterAuthAlreadyHasPasswordError(error)) {
        return;
      }
      throw error;
    }
  }

  /** 이메일 인증코드 발송 */
  async requestEmailVerification(email: string) {
    const request = new Request(
      `${this.baseURL}/api/auth/email-otp/send-verification-otp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          type: 'sign-in',
        }),
      },
    );

    const response = await this.authClient.handler(request);
    if (!response.ok) {
      const message = await this.getAuthErrorMessage(
        response,
        '이메일 인증코드 발송에 실패했습니다.',
      );
      throw new BadRequestException(message);
    }

    return { status: true };
  }

  /** 이메일 인증코드 검증 */
  async verifyEmailVerification(email: string, otp: string) {
    const request = new Request(`${this.baseURL}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        otp,
      }),
    });

    const response = await this.authClient.handler(request);
    if (!response.ok) {
      const message = await this.getAuthErrorMessage(
        response,
        '인증코드가 올바르지 않거나 만료되었습니다.',
      );
      throw new BadRequestException(message);
    }

    const result = await response.json();
    const setCookie = this.getSetCookieHeaders(response.headers);
    const { user, session, token } = result as AuthResponse;
    const finalSession = session || (token ? { token } : null);

    return {
      user,
      session: finalSession,
      setCookie,
    };
  }

  /** 이메일 인증 링크 검증 */
  async verifyEmailWithToken(token: string) {
    const url = new URL(`${this.baseURL}/api/auth/verify-email`);
    url.searchParams.set('token', token);

    const request = new Request(url.toString(), {
      method: 'GET',
      headers: this.toRequestHeaders(),
    });

    const response = await this.authClient.handler(request);

    const setCookie = this.getSetCookieHeaders(response.headers);
    const redirectTo = response.headers.get('location');

    if (response.status >= 300 && response.status < 400) {
      return {
        status: true,
        user: null,
        setCookie,
        redirectTo,
      };
    }

    if (!response.ok) {
      const message = await this.getAuthErrorMessage(
        response,
        '이메일 인증에 실패했습니다.',
      );
      throw new BadRequestException(message);
    }

    const result = await this.parseJsonResponse<{
      status: boolean;
      user: AuthUser | null;
    }>(response);

    return {
      ...result,
      setCookie,
      redirectTo,
    };
  }

  async requestAdminActivationOtp(email: string) {
    const normalizedEmail = this.normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, userType: true },
    });

    if (!user || user.userType !== UserType.ADMIN) {
      return { status: true };
    }

    const admin = await this.adminRepo.findByUserId(user.id);

    if (admin?.status === AdminProfileStatus.PENDING_ACTIVATION) {
      try {
        await this.requestEmailVerification(normalizedEmail);
      } catch (error) {
        console.error('[AuthService] admin activation OTP dispatch failed', {
          emailToken: this.getEmailLogToken(normalizedEmail),
          userId: user.id,
          error,
        });
      }
    }

    return { status: true };
  }

  async verifyAdminActivationOtp(email: string, otp: string) {
    const normalizedEmail = this.normalizeEmail(email);

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, userType: true },
    });

    if (!user || user.userType !== UserType.ADMIN) {
      throw new BadRequestException(
        '인증코드가 올바르지 않거나 만료되었습니다.',
      );
    }

    const admin = await this.adminRepo.findByUserId(user.id);

    if (!admin || admin.status !== AdminProfileStatus.PENDING_ACTIVATION) {
      throw new BadRequestException(
        '인증코드가 올바르지 않거나 만료되었습니다.',
      );
    }

    const result = await this.verifyEmailVerification(normalizedEmail, otp);

    if (result.user.userType !== UserType.ADMIN || result.user.id !== user.id) {
      throw new BadRequestException(
        '인증코드가 올바르지 않거나 만료되었습니다.',
      );
    }

    return result;
  }

  async completeAdminActivation(
    headers: IncomingHttpHeaders,
    password: string,
  ) {
    const authSession = await this.authClient.api.getSession({
      headers: fromNodeHeaders(headers),
      query: {
        disableCookieCache: true,
      },
    });

    if (!authSession) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    if (authSession.user.userType !== UserType.ADMIN) {
      throw new ForbiddenException('관리자 계정만 활성화할 수 있습니다.');
    }

    const admin = await this.getAdminOrThrow(authSession.user.id);

    if (admin.status !== AdminProfileStatus.PENDING_ACTIVATION) {
      throw new ForbiddenException('이미 활성화된 관리자 계정입니다.');
    }

    await this.ensureCredentialPassword(authSession.user.id, headers, password);

    const now = new Date();
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: authSession.user.id },
        data: {
          emailVerified: true,
          role: 'admin',
        },
      });

      await tx.admin.update({
        where: { userId: authSession.user.id },
        data: {
          status: AdminProfileStatus.ACTIVE,
          activatedAt: now,
        },
      });

      return user;
    });

    return {
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        userType: updatedUser.userType,
        emailVerified: updatedUser.emailVerified,
        image: updatedUser.image,
        role: updatedUser.role,
      },
      session: authSession.session,
      profile: null,
    };
  }

  /** 내 이메일 변경 */
  async changeMyEmail(headers: IncomingHttpHeaders, newEmail: string) {
    const { data } = await this.callAuthHandler<{ status: boolean }>({
      path: '/change-email',
      method: 'POST',
      headers,
      body: { newEmail },
      fallbackErrorMessage: '이메일 변경에 실패했습니다.',
    });

    return data;
  }

  /** 내 비밀번호 변경 */
  async changeMyPassword(
    headers: IncomingHttpHeaders,
    currentPassword: string,
    newPassword: string,
    revokeOtherSessions: boolean = false,
  ) {
    const { data, setCookie } = await this.callAuthHandler<{
      token: string | null;
      user: AuthUser;
    }>({
      path: '/change-password',
      method: 'POST',
      headers,
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions,
      },
      fallbackErrorMessage: '비밀번호 변경에 실패했습니다.',
    });

    return {
      ...data,
      setCookie,
    };
  }

  /** 이메일 기반 비밀번호 찾기 */
  async findPassword(email: string) {
    const { data } = await this.callAuthHandler<{
      success: boolean;
    }>({
      path: '/email-otp/send-verification-otp',
      method: 'POST',
      body: {
        email,
        type: 'forget-password',
      },
      fallbackErrorMessage: '비밀번호 재설정 인증코드 발송에 실패했습니다.',
    });

    return data;
  }

  /** 비밀번호 재설정 (OTP) */
  async resetPasswordWithOTP(email: string, otp: string, newPassword: string) {
    const { data } = await this.callAuthHandler<{ success: boolean }>({
      path: '/email-otp/reset-password',
      method: 'POST',
      body: {
        email,
        otp,
        password: newPassword,
      },
      fallbackErrorMessage: '비밀번호 재설정에 실패했습니다.',
    });

    return data;
  }

  /** 사전 이메일 인증 세션 기반 회원가입 완료 */
  async completeSignUpWithVerifiedEmail(
    userType: UserType,
    data: SignUpData,
    headers: IncomingHttpHeaders,
  ) {
    const authSession = await this.authClient.api.getSession({
      headers: fromNodeHeaders(headers),
      query: {
        disableCookieCache: true,
      },
    });

    if (!authSession) {
      throw new UnauthorizedException(
        '이메일 인증 후 회원가입을 진행해주세요.',
      );
    }

    if (authSession.user.userType !== SIGNUP_PENDING_USER_TYPE) {
      throw new ForbiddenException('이미 회원가입이 완료된 계정입니다.');
    }

    if (
      authSession.user.email.toLowerCase() !== data.email.trim().toLowerCase()
    ) {
      throw new ForbiddenException(
        '인증된 이메일과 회원가입 이메일이 일치하지 않습니다.',
      );
    }

    const existingProfile = await this.findProfileByPhoneNumber(
      userType,
      data.phoneNumber,
    );
    if (existingProfile) {
      throw new BadRequestException('이미 가입된 전화번호입니다.');
    }

    const existingProfileByUserId = await this.findProfileByUserId(
      userType,
      authSession.user.id,
    );
    if (existingProfileByUserId) {
      throw new BadRequestException('이미 가입이 완료된 계정입니다.');
    }

    await this.ensureCredentialPassword(
      authSession.user.id,
      headers,
      data.password,
    );

    const updateUserPayload = {
      name: data.name || data.email,
      userType,
    };

    const { setCookie } = await this.callAuthHandler<{ status: boolean }>({
      path: '/update-user',
      method: 'POST',
      headers,
      body: {
        name: data.name || data.email,
        userType,
      },
      fallbackErrorMessage: '사용자 정보 업데이트에 실패했습니다.',
    });

    const updatedResult = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: authSession.user.id },
        data: {
          ...updateUserPayload,
          ...(userType === UserType.INSTRUCTOR ? { role: 'instructor' } : {}),
        },
      });

      let profile;

      if (userType === UserType.INSTRUCTOR) {
        profile = await this.createInstructor(authSession.user.id, data, tx);
      }
      if (userType === UserType.ASSISTANT) {
        profile = await this.createAssistant(authSession.user.id, data, tx);
      }
      if (userType === UserType.STUDENT) {
        profile = await this.createStudent(authSession.user.id, data, tx);
      }
      if (userType === UserType.PARENT) {
        profile = await this.createParent(authSession.user.id, data, tx);
      }

      return { updatedUser, profile };
    });

    if (!updatedResult) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    const { updatedUser, profile } = updatedResult;

    const user: AuthUser = {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      userType: updatedUser.userType,
      emailVerified: updatedUser.emailVerified,
      image: updatedUser.image,
    };

    return {
      user,
      session: authSession.session,
      profile,
      setCookie,
    };
  }

  /** 로그인 */
  async signIn(
    email: string,
    password: string,
    requiredUserType: UserType,
    rememberMe: boolean = false,
  ) {
    // 1. 이메일로 유저 조회하여 타입 검증
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser?.userType === SIGNUP_PENDING_USER_TYPE) {
      throw new UnauthorizedException(
        '회원가입이 완료되지 않았습니다. 이메일 인증 후 가입 절차를 완료해주세요.',
      );
    }

    if (
      existingUser &&
      (existingUser.userType as UserType) !== requiredUserType
    ) {
      throw new ForbiddenException('유저 역할이 잘못되었습니다.');
    }

    if (existingUser?.userType === UserType.ADMIN) {
      const admin = await this.getAdminOrThrow(existingUser.id);

      if (admin.status !== AdminProfileStatus.ACTIVE) {
        throw new ForbiddenException('관리자 최초 활성화가 필요합니다.');
      }
    }

    // 2. auth.handler를 사용하여 로그인 및 쿠키 캡처
    const signInReq = new Request(`${this.baseURL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        rememberMe,
      }),
    });

    const response = await this.authClient.handler(signInReq);

    if (!response.ok) {
      const errorData = await response.json(); // 에러 메시지 확인용
      console.log('SignIn Error:', errorData);
      throw new UnauthorizedException(
        '이메일 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const result = await response.json();
    const setCookie = this.getSetCookieHeaders(response.headers);

    const { user, session, token } = result as AuthResponse;
    const finalSession = session || (token ? { token } : null);

    if (!this.isSupportedUserType(user.userType)) {
      throw new UnauthorizedException(
        '회원가입이 완료되지 않았습니다. 이메일 인증 후 가입 절차를 완료해주세요.',
      );
    }

    if (requiredUserType === UserType.ADMIN && !hasAdminRole(user.role)) {
      throw new ForbiddenException('관리자 권한이 없습니다.');
    }

    if (requiredUserType === UserType.ADMIN) {
      await this.ensureActiveAdminOrThrow(user.id);
    }

    const profile = await this.findProfileByUserId(user.userType, user.id);
    if (requiredUserType !== UserType.ADMIN && !profile) {
      throw new UnauthorizedException(
        '회원가입이 완료되지 않았습니다. 이메일 인증 후 가입 절차를 완료해주세요.',
      );
    }

    return {
      user,
      session: finalSession,
      profile,
      setCookie, // 쿠키 헤더 반환
    };
  }

  async signInAdmin(
    email: string,
    password: string,
    rememberMe: boolean = false,
  ) {
    return this.signIn(email, password, UserType.ADMIN, rememberMe);
  }

  /** 로그아웃 (핸들러에서 처리하거나 API 호출) */
  async signOut(headers: IncomingHttpHeaders) {
    return await this.authClient.api.signOut({
      headers: headers as Record<string, string>,
    });
  }

  /** 회원 탈퇴 (Better Auth API 사용) */
  async withdraw(headers: IncomingHttpHeaders) {
    return await this.authClient.api.deleteUser({
      headers: fromNodeHeaders(headers),
      body: {},
    });
  }

  /** 관리자용 회원 탈퇴 처리 (userId 기반) */
  async deleteUserById(userId: string, headers: IncomingHttpHeaders) {
    // 1. 삭제 대상 유저 조회
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    // 2. 조교만 삭제 가능하도록 제한
    if (user.userType !== UserType.ASSISTANT) {
      throw new ForbiddenException('조교만 삭제할 수 있습니다.');
    }

    // 3. Better Auth admin API를 사용하여 userId로 직접 삭제
    // cascade 설정에 의해 session, account 등도 삭제됨
    await this.authClient.api.removeUser({
      body: { userId },
      headers: fromNodeHeaders(headers),
    });
  }

  /** 세션 조회 */

  async getSession(headers: IncomingHttpHeaders) {
    const session = await this.authClient.api.getSession({
      headers: fromNodeHeaders(headers),
    });

    if (!session) return null;

    const profile = await this.findProfileByUserId(
      session.user.userType as UserType,
      session.user.id,
    );

    return {
      ...session,
      profile,
    };
  }

  async getSessionWithInstructorBillingSummary(headers: IncomingHttpHeaders) {
    const session = await this.getSession(headers);

    if (!session) {
      return session;
    }

    const profile = session.profile as {
      id: string;
      instructorId?: string;
      [key: string]: unknown;
    } | null;

    if (!profile) {
      return session;
    }

    const billingTargetInstructorId =
      session.user.userType === UserType.INSTRUCTOR
        ? profile.id
        : session.user.userType === UserType.ASSISTANT
          ? profile.instructorId
          : null;

    if (!billingTargetInstructorId) {
      return session;
    }

    const billingSummary =
      await this.billingService.getInstructorBillingSummary(
        billingTargetInstructorId,
      );

    return {
      ...session,
      profile: {
        ...profile,
        activeEntitlement: billingSummary.activeEntitlement,
      },
    };
  }

  async getAdminSession(headers: IncomingHttpHeaders) {
    const session = await this.getSession(headers);

    if (!session) {
      return null;
    }

    if (
      session.user.userType !== UserType.ADMIN ||
      !hasAdminRole(session.user.role as string | string[] | null | undefined)
    ) {
      throw new ForbiddenException('관리자 권한이 필요합니다.');
    }

    const admin = await this.ensureActiveAdminOrThrow(session.user.id);

    return {
      ...session,
      canInviteAdmins: admin.isPrimaryAdmin,
    };
  }

  async ensureAdminAccess(userId: string) {
    return this.ensureActiveAdminOrThrow(userId);
  }

  /** 강사 프로필 생성 */
  private async createInstructor(
    userId: string,
    data: SignUpData,
    tx?: Prisma.TransactionClient,
  ) {
    return await this.instructorRepo.create(
      {
        userId,
        phoneNumber: data.phoneNumber,
        subject: data.subject,
        academy: data.academy,
      },
      tx,
    );
  }

  /** 조교 프로필 생성 */
  private async createAssistant(
    userId: string,
    data: SignUpData,
    tx?: Prisma.TransactionClient,
  ) {
    if (!data.signupCode) {
      throw new BadRequestException('조교가입코드가 필요합니다.');
    }

    const assistantCode = await this.assistantCodeRepo.findValidCode(
      data.signupCode,
      tx,
    );
    if (!assistantCode) {
      throw new BadRequestException(
        '유효하지 않거나 만료된 조교가입코드입니다.',
      );
    }

    if (tx) {
      await this.assistantCodeRepo.markAsUsed(assistantCode.id, tx);
      return await this.assistantRepo.create(
        {
          userId,
          name: data.name || 'Assistant',
          phoneNumber: data.phoneNumber,
          instructorId: assistantCode.instructorId,
          signupCode: data.signupCode!,
        },
        tx,
      );
    }

    return await this.prisma.$transaction(async (innerTx) => {
      await this.assistantCodeRepo.markAsUsed(assistantCode.id, innerTx);
      return await this.assistantRepo.create(
        {
          userId,
          name: data.name || 'Assistant',
          phoneNumber: data.phoneNumber,
          instructorId: assistantCode.instructorId,
          signupCode: data.signupCode!,
        },
        innerTx,
      );
    });
  }

  /** 학생 프로필 생성 */
  private async createStudent(
    userId: string,
    data: SignUpData,
    tx?: Prisma.TransactionClient,
  ) {
    const student = await this.studentRepo.create(
      {
        userId,
        phoneNumber: data.phoneNumber,
        parentPhoneNumber: data.parentPhoneNumber,
        school: data.school,
        schoolYear: data.schoolYear,
      },
      tx,
    );

    if (data.parentPhoneNumber) {
      await this.enrollmentsRepo.updateAppStudentIdByStudentPhoneAndParentPhone(
        data.phoneNumber,
        data.parentPhoneNumber,
        student.id,
        tx,
      );
    }

    return student;
  }

  /** 학부모 프로필 생성 */
  private async createParent(
    userId: string,
    data: SignUpData,
    tx?: Prisma.TransactionClient,
  ) {
    return await this.parentRepo.create(
      {
        userId,
        phoneNumber: data.phoneNumber,
      },
      tx,
    );
  }

  /** ID로 프로필 조회 */
  private async findProfileByUserId(userType: UserType, userId: string) {
    switch (userType) {
      case UserType.ADMIN:
        return null;
      case UserType.INSTRUCTOR:
        return this.instructorRepo.findByUserId(userId);
      case UserType.ASSISTANT:
        return this.assistantRepo.findByUserId(userId);
      case UserType.STUDENT:
        return this.studentRepo.findByUserId(userId);
      case UserType.PARENT:
        return this.parentRepo.findByUserId(userId);
    }
  }

  /** 전화번호로 프로필 조회 */
  private async findProfileByPhoneNumber(
    userType: UserType,
    phoneNumber: string,
  ) {
    switch (userType) {
      case UserType.ADMIN:
        return null;
      case UserType.INSTRUCTOR:
        return this.instructorRepo.findByPhoneNumber(phoneNumber);
      case UserType.ASSISTANT:
        return this.assistantRepo.findByPhoneNumber(phoneNumber);
      case UserType.STUDENT:
        return this.studentRepo.findByPhoneNumber(phoneNumber);
      case UserType.PARENT:
        return this.parentRepo.findByPhoneNumber(phoneNumber);
    }
  }
}
