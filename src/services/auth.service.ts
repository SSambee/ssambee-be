import type { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '../err/http.exception.js';
import { UserType } from '../constants/auth.constant.js';
import { auth } from '../config/auth.config.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { ParentRepository } from '../repos/parent.repo.js';
import { SignUpData, AuthResponse, AuthUser } from '../types/auth.types.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { config } from '../config/env.config.js';

export class AuthService {
  constructor(
    private readonly instructorRepo: InstructorRepository,
    private readonly assistantRepo: AssistantRepository,
    private readonly assistantCodeRepo: AssistantCodeRepository,
    private readonly studentRepo: StudentRepository,
    private readonly parentRepo: ParentRepository,
    private readonly enrollmentsRepo: EnrollmentsRepository,
    private readonly authClient: typeof auth,
    private readonly prisma: PrismaClient,
  ) {}

  private readonly baseURL = config.BETTER_AUTH_URL;

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
    const setCookie = response.headers.get('set-cookie');

    return { data, setCookie };
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
    const setCookie = response.headers.get('set-cookie');
    const { user, session, token } = result as AuthResponse;
    const finalSession = session || (token ? { token } : null);

    return {
      user,
      session: finalSession,
      setCookie,
    };
  }

  /** 내 이메일 변경 */
  async changeMyEmail(
    headers: IncomingHttpHeaders,
    newEmail: string,
    callbackURL?: string,
  ) {
    const { data } = await this.callAuthHandler<{ status: boolean }>({
      path: '/change-email',
      method: 'POST',
      headers,
      body: {
        newEmail,
        callbackURL,
      },
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
  async findPassword(email: string, redirectTo?: string) {
    const { data } = await this.callAuthHandler<{
      status: boolean;
      message: string;
    }>({
      path: '/request-password-reset',
      method: 'POST',
      body: {
        email,
        redirectTo,
      },
      fallbackErrorMessage: '비밀번호 재설정 메일 발송에 실패했습니다.',
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

    await this.callAuthHandler<{ status: boolean }>({
      path: '/set-password',
      method: 'POST',
      headers,
      body: {
        newPassword: data.password,
      },
      fallbackErrorMessage: '비밀번호 설정에 실패했습니다.',
    });

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

    let profile;
    switch (userType) {
      case UserType.INSTRUCTOR:
        profile = await this.createInstructor(authSession.user.id, data);
        break;
      case UserType.ASSISTANT:
        profile = await this.createAssistant(authSession.user.id, data);
        break;
      case UserType.STUDENT:
        profile = await this.createStudent(authSession.user.id, data);
        break;
      case UserType.PARENT:
        profile = await this.createParent(authSession.user.id, data);
        break;
    }

    const updatedUser = await this.prisma.user.findUnique({
      where: { id: authSession.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        userType: true,
        emailVerified: true,
        image: true,
      },
    });

    if (!updatedUser) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

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

    if (
      existingUser &&
      (existingUser.userType as UserType) !== requiredUserType
    ) {
      throw new ForbiddenException('유저 역할이 잘못되었습니다.');
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
    const setCookie = response.headers.get('set-cookie');

    const { user, session, token } = result as AuthResponse;
    const finalSession = session || (token ? { token } : null);

    const profile = await this.findProfileByUserId(
      user.userType as UserType,
      user.id,
    );

    return {
      user,
      session: finalSession,
      profile,
      setCookie, // 쿠키 헤더 반환
    };
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

  /** 강사 프로필 생성 */
  private async createInstructor(userId: string, data: SignUpData) {
    return await this.instructorRepo.create({
      userId,
      phoneNumber: data.phoneNumber,
      subject: data.subject,
      academy: data.academy,
    });
  }

  /** 조교 프로필 생성 */
  private async createAssistant(userId: string, data: SignUpData) {
    if (!data.signupCode) {
      throw new BadRequestException('조교가입코드가 필요합니다.');
    }

    const assistantCode = await this.assistantCodeRepo.findValidCode(
      data.signupCode,
    );
    if (!assistantCode) {
      throw new BadRequestException(
        '유효하지 않거나 만료된 조교가입코드입니다.',
      );
    }

    return await this.prisma.$transaction(async (tx) => {
      await this.assistantCodeRepo.markAsUsed(assistantCode.id, tx);
      return await this.assistantRepo.create(
        {
          userId,
          name: data.name || 'Assistant', // name이 없을 경우 기본값 처리 또는 data.name 사용
          phoneNumber: data.phoneNumber,
          instructorId: assistantCode.instructorId,
          signupCode: data.signupCode!,
        },
        tx,
      );
    });
  }

  /** 학생 프로필 생성 */
  private async createStudent(userId: string, data: SignUpData) {
    const student = await this.studentRepo.create({
      userId,
      phoneNumber: data.phoneNumber,
      school: data.school,
      schoolYear: data.schoolYear,
    });

    // 전화번호로 기존 수강 내역 자동 연동
    await this.enrollmentsRepo.updateAppStudentIdByPhoneNumber(
      data.phoneNumber,
      student.id,
    );

    return student;
  }

  /** 학부모 프로필 생성 */
  private async createParent(userId: string, data: SignUpData) {
    return await this.parentRepo.create({
      userId,
      phoneNumber: data.phoneNumber,
    });
  }

  /** ID로 프로필 조회 */
  private async findProfileByUserId(userType: UserType, userId: string) {
    switch (userType) {
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
