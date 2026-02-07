import { PrismaClient } from '../generated/prisma/client.js';
import { randomInt } from 'node:crypto';
import { addDays } from 'date-fns';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';

export class AssistantCodesService {
  constructor(
    private readonly assistantCodeRepo: AssistantCodeRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 조교 가입 코드 생성 */
  async createCode(instructorId: string) {
    // 숫자 + 영문 대소문자 혼합, 6자리
    const chars =
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const codeLength = 6;
    let code = '';
    for (let i = 0; i < codeLength; i++) {
      code += chars[randomInt(0, chars.length)];
    }

    const expireAt = addDays(new Date(), 1); // 24시간 유효

    return await this.assistantCodeRepo.create({
      code,
      instructorId,
      expireAt,
    });
  }

  /** 강사의 조교 가입 코드 목록 조회 */
  async getCodesByInstructor(instructorId: string) {
    return await this.assistantCodeRepo.findByInstructorId(instructorId);
  }
}
