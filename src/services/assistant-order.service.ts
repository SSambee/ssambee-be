import { PrismaClient } from '../generated/prisma/client.js';
import { AssistantOrderRepository } from '../repos/assistant-order.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { CreateAssistantOrderDto } from '../validations/assistant-order.validation.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

export class AssistantOrderService {
  constructor(
    private readonly assistantOrderRepository: AssistantOrderRepository,
    private readonly assistantRepository: AssistantRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * 지시 생성
   */
  async createOrder(instructorId: string, data: CreateAssistantOrderDto) {
    const { assistantId, materialIds, deadlineAt, ...rest } = data;

    // 1. 조교 존재 및 강사 소속 여부 확인
    const assistant = await this.assistantRepository.findById(assistantId);
    if (!assistant) {
      throw new NotFoundException('조교를 찾을 수 없습니다.');
    }
    if (assistant.instructorId !== instructorId) {
      throw new ForbiddenException('해당 조교에 대한 접근 권한이 없습니다.');
    }

    // 2. Material 검증 및 정보 조회
    const attachments = [];
    if (materialIds && materialIds.length > 0) {
      // Prisma의 in query로 한 번에 조회
      const materials = await this.materialsRepository.findByIds(materialIds);

      // 개수 확인 (존재하지 않는 ID가 있는지)
      if (materials.length !== materialIds.length) {
        throw new NotFoundException('일부 자료를 찾을 수 없습니다.');
      }

      // 소유권 확인
      for (const material of materials) {
        if (material.instructorId !== instructorId) {
          throw new ForbiddenException('자료에 대한 접근 권한이 없습니다.');
        }
        attachments.push({
          materialId: material.id,
          filename: material.title, // Material 제목을 파일명으로 사용
          fileUrl: material.fileUrl,
        });
      }
    }

    // 3. 지시 생성 (트랜잭션 불필요하지만 확장성을 위해 고려 가능, 현재는 단일 create라 생략)
    return await this.assistantOrderRepository.create(instructorId, {
      ...rest,
      assistantId,
      deadlineAt: deadlineAt ? new Date(deadlineAt) : undefined,
      attachments,
    });
  }
}
