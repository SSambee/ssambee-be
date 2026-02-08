import { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { PrismaClient } from '../generated/prisma/client.js';
import { auth } from '../config/auth.config.js';
import { UserType } from '../constants/auth.constant.js';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '../err/http.exception.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { ParentRepository } from '../repos/parent.repo.js';
import { SignUpData, AuthResponse } from '../types/auth.types.js';
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

  /** 회원가입 */
  async signUp(userType: UserType, data: SignUpData) {
    const existingProfile = await this.findProfileByPhoneNumber(
      userType,
      data.phoneNumber,
    );

    if (existingProfile) {
      throw new BadRequestException('이미 가입된 전화번호입니다.');
    }

    // auth.handler를 사용하여 요청을 처리하고 쿠키를 캡처
    const signUpReq = new Request(`${this.baseURL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        name: data.name || data.email,
        userType: userType,
      }),
    });

    const response = await this.authClient.handler(signUpReq);

    if (!response.ok) {
      // 에러 처리
      const errorBody = await response.json();
      throw new InternalServerErrorException(
        errorBody.message || '회원가입 실패',
      );
    }

    const result = await response.json();
    const setCookie = response.headers.get('set-cookie');

    // result의 구조: { user, session, token } (토큰 반환 설정 여부에 따라 다름)
    const { user, session, token } = result as AuthResponse;
    const finalSession = session || (token ? { token } : null);
    const userId = user.id;

    let profile;
    try {
      switch (userType) {
        case UserType.INSTRUCTOR:
          profile = await this.createInstructor(userId, data);
          break;
        case UserType.ASSISTANT:
          profile = await this.createAssistant(userId, data);
          break;
        case UserType.STUDENT:
          profile = await this.createStudent(userId, data);
          break;
        case UserType.PARENT:
          profile = await this.createParent(userId, data);
          break;
      }
    } catch (error) {
      await this.prisma.user.delete({ where: { id: userId } });
      throw error;
    }

    return { user, session: finalSession, profile, setCookie };
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
