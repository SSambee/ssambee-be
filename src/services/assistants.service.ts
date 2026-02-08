import type { AssistantRepository } from '../repos/assistant.repo.js';
import {
  AssistantSignStatus,
  SIGN_STATUS_MAP,
} from '../constants/assistants.constant.js';

export class AssistantsService {
  constructor(private readonly assistantRepository: AssistantRepository) {}

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
}
