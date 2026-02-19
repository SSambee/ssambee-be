import { z } from 'zod';
import { UserType } from '../constants/auth.constant.js';
import { Regex } from '../constants/regex.constant.js';

/**
 * 공통 필드 검증 스키마
 */
const emailSchema = z.string().email('유효한 이메일 형식이 아닙니다.');
const passwordSchema = z
  .string()
  .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
  .regex(Regex.PASSWORD_ALPHA, '비밀번호에 영문자가 포함되어야 합니다.')
  .regex(Regex.PASSWORD_NUMBER, '비밀번호에 숫자가 포함되어야 합니다.');
const phoneSchema = z
  .string()
  .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.');
const userTypeSchema = z.enum([
  UserType.INSTRUCTOR,
  UserType.ASSISTANT,
  UserType.STUDENT,
  UserType.PARENT,
]);

/**
 * 로그인 요청 검증 스키마 (통합)
 */
export const signInSchema = z.object({
  /** 이메일 */
  email: emailSchema,
  /** 비밀번호 */
  password: passwordSchema,
  /** 사용자 역할 (강사, 조교, 학생, 학부모) */
  userType: userTypeSchema,
  /** 로그인 상태 유지 여부 */
  rememberMe: z.boolean().optional(),
});

/**
 * 이메일 인증(OTP) 요청 스키마
 * - otp 없으면 인증코드 발송
 * - otp 있으면 인증코드 검증
 */
export const emailVerificationSchema = z.object({
  email: emailSchema,
  otp: z.preprocess((value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    }
    return value;
  }, z.string().min(4).max(8).optional()),
});

/** 이메일 변경 요청 스키마 */
export const changeMyEmailSchema = z.object({
  newEmail: emailSchema,
});

/** 비밀번호 변경 요청 스키마 */
export const changeMyPasswordSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호는 필수입니다.'),
  newPassword: passwordSchema,
  revokeOtherSessions: z.boolean().optional(),
});

/** 이메일 기반 비밀번호 찾기 요청 스키마 */
export const findPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: z.string().min(4).max(8),
  newPassword: passwordSchema,
});

/**
 * 강사 회원가입 요청 검증 스키마
 */
export const instructorSignUpSchema = z.object({
  /** 이메일 */
  email: emailSchema,
  /** 비밀번호 */
  password: passwordSchema,
  /** 이름 */
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  /** 전화번호 */
  phoneNumber: phoneSchema,
  /** 담당 과목 (선택) */
  subject: z.string().optional(),
  /** 소속 학원 (선택) */
  academy: z.string().optional(),
});

/**
 * 조교 회원가입 요청 검증 스키마
 */
export const assistantSignUpSchema = z.object({
  /** 이메일 */
  email: emailSchema,
  /** 비밀번호 */
  password: passwordSchema,
  /** 이름 */
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  /** 전화번호 */
  phoneNumber: phoneSchema,
  /** 조교 가입 코드 (필수) */
  signupCode: z.string().min(1, '조교 가입 코드가 필요합니다.'),
});

/**
 * 학생 회원가입 요청 검증 스키마
 */
export const studentSignUpSchema = z.object({
  /** 이메일 */
  email: emailSchema,
  /** 비밀번호 */
  password: passwordSchema,
  /** 이름 */
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  /** 전화번호 */
  phoneNumber: phoneSchema,
  /** 소속 학교 (선택) */
  school: z.string().optional(),
  /** 학년 (선택) */
  schoolYear: z.string().optional(),
});

/**
 * 학부모 회원가입 요청 검증 스키마
 */
export const parentSignUpSchema = z.object({
  /** 이메일 */
  email: emailSchema,
  /** 이름 */
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  /** 비밀번호 */
  password: passwordSchema,
  /** 전화번호 */
  phoneNumber: phoneSchema,
});
