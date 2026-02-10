import type { IncomingHttpHeaders } from 'http';
import { PrismaClient } from '../generated/prisma/client.js';
import type { AssistantRepository } from '../repos/assistant.repo.js';
import {
  AssistantSignStatus,
  SIGN_STATUS_MAP,
} from '../constants/assistants.constant.js';
import { AuthService } from './auth.service.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { UpdateAssistantBodyDto } from '../validations/assistants.validation.js';

export class AssistantsService {
  constructor(
    private readonly assistantRepository: AssistantRepository,
    private readonly authService: AuthService,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * 강사별 조교 목록 조회
   * @param instructorId 강사 ID
   * @param statusQuery 쿼리 파라미터로 전달된 상태 (pending, expired 등)
   */
  async getAssistantsByInstructor(instructorId: string, statusQuery?: string) {
    const signStatus = statusQuery
      ? SIGN_STATUS_MAP[statusQuery as keyof typeof SIGN_STATUS_MAP]
      : AssistantSignStatus.SIGNED;

    const assistants = await this.assistantRepository.findManyByInstructorId(
      instructorId,
      signStatus,
    );

    return assistants;
  }

  /**
   * 조교 정보 수정
   */
  async updateAssistant(
    id: string,
    instructorId: string,
    data: UpdateAssistantBodyDto,
  ) {
    const assistant = await this.assistantRepository.findById(id);

    if (!assistant) {
      throw new NotFoundException('조교를 찾을 수 없습니다.');
    }

    if (assistant.instructorId !== instructorId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return await this.assistantRepository.update(id, data);
  }

  /**
   * 조교 가입 승인
   */
  async approveAssistant(id: string, instructorId: string) {
    const assistant = await this.assistantRepository.findById(id);

    if (!assistant) {
      throw new NotFoundException('조교를 찾을 수 없습니다.');
    }

    if (assistant.instructorId !== instructorId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return await this.assistantRepository.updateSignStatus(
      id,
      AssistantSignStatus.SIGNED,
    );
  }

  /**
   * 조교 가입 거부 (Better Auth 회원 탈퇴 + signStatus 변경)
   */
  async rejectAssistant(
    id: string,
    instructorId: string,
    headers: IncomingHttpHeaders,
  ) {
    const assistant = await this.assistantRepository.findById(id);

    if (!assistant) {
      throw new NotFoundException('조교를 찾을 수 없습니다.');
    }

    if (assistant.instructorId !== instructorId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Better Auth 회원 탈퇴 (userId가 있는 경우에만)
      if (assistant.userId) {
        await this.authService.deleteUserById(assistant.userId, headers);
      }

      // 2. signStatus 변경
      await this.assistantRepository.updateSignStatus(
        id,
        AssistantSignStatus.REJECTED,
        tx,
      );

      // 3. deletedAt 설정
      return await this.assistantRepository.softDelete(id, tx);
    });
  }

  /**
   * 조교 탈퇴 처리 (Better Auth 회원 탈퇴 + signStatus 변경)
   */
  async expireAssistant(
    id: string,
    instructorId: string,
    headers: IncomingHttpHeaders,
  ) {
    const assistant = await this.assistantRepository.findById(id);

    if (!assistant) {
      throw new NotFoundException('조교를 찾을 수 없습니다.');
    }

    if (assistant.instructorId !== instructorId) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 1. Better Auth 회원 탈퇴 (userId가 있는 경우에만)
      if (assistant.userId) {
        await this.authService.deleteUserById(assistant.userId, headers);
      }

      // 2. signStatus 변경
      await this.assistantRepository.updateSignStatus(
        id,
        AssistantSignStatus.EXPIRED,
        tx,
      );

      // 3. deletedAt 설정
      return await this.assistantRepository.softDelete(id, tx);
    });
  }
}
