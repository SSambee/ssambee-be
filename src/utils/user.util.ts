import { Request } from 'express';
import { AuthResponse, ProfileBase } from '../types/auth.types.js';
import { UnauthorizedException } from '../err/http.exception.js';

/**
 * 요청 객체에서 인증된 사용자 정보를 추출합니다.
 *
 * @param req - Express Request 객체
 * @returns 인증된 사용자 정보 (User)
 */
export const getAuthUser = (req: Request) => {
  const { user } = req as unknown as { user: AuthResponse['user'] };
  return user;
};

/**
 * 요청 객체에서 현재 사용자의 프로필 정보를 추출합니다.
 * 프로필이 없는 경우 UnauthorizedException을 던집니다.
 *
 * @param req - Express Request 객체
 * @returns 현재 사용자의 프로필 정보
 * @throws UnauthorizedException - 프로필 정보가 없는 경우
 */
export const getProfileOrThrow = (req: Request) => {
  const profile = (req as Request & { profile?: ProfileBase }).profile;
  if (!profile) {
    throw new UnauthorizedException('사용자 프로필을 찾을 수 없습니다.');
  }
  return profile;
};

/**
 * 현재 사용자의 프로필 ID를 반환합니다.
 *
 * @param req - Express Request 객체
 * @returns 프로필 ID
 */
export const getProfileIdOrThrow = (req: Request) => {
  return getProfileOrThrow(req).id;
};

/**
 * 강사 권한으로 작업을 수행할 때 사용할 강사 ID를 추출합니다.
 * - 사용자가 강사인 경우: 본인의 프로필 ID 반환
 * - 사용자가 조교인 경우: 담당 강사의 ID 반환
 *
 * @param req - Express Request 객체
 * @returns 유효한 강사 ID
 */
export const getInstructorIdOrThrow = (req: Request) => {
  const profile = getProfileOrThrow(req) as ProfileBase & {
    instructorId?: string;
  };

  // 강사인 경우 본인 ID 반환
  if (!profile.instructorId) {
    return profile.id;
  }

  // 조교인 경우 연결된 instructorId 반환
  return profile.instructorId;
};
