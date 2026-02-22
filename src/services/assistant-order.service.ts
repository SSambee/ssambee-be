import { PrismaClient } from '../generated/prisma/client.js';
import { AssistantOrderRepository } from '../repos/assistant-order.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import {
  CreateAssistantOrderDto,
  GetAssistantOrdersQueryDto,
  UpdateAssistantOrderDto,
} from '../validations/assistant-order.validation.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { UserType } from '../constants/auth.constant.js';

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

  /**
   * 지시 개별 조회
   */
  async getOrderById(userType: UserType, profileId: string, orderId: string) {
    const order = await this.assistantOrderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException('지시를 찾을 수 없습니다.');
    }

    // 권한 검증
    if (userType === UserType.INSTRUCTOR) {
      if (order.instructorId !== profileId) {
        throw new ForbiddenException('해당 지시에 대한 접근 권한이 없습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      if (order.assistantId !== profileId) {
        throw new ForbiddenException('해당 지시에 대한 접근 권한이 없습니다.');
      }
    } else {
      // 강사나 조교가 아닌 경우 (혹시 모를 안전 장치)
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return {
      id: order.id,
      title: order.title,
      memo: order.memo,
      workStatus: order.status,
      priority: order.priority,
      createdAt: order.createdAt,
      deadlineAt: order.deadlineAt,
      instructor: {
        id: order.instructor.id,
        name: order.instructor.user.name,
      },
      assistant: {
        id: order.assistant.id,
        name: order.assistant.name,
      },
      attachments: order.attachments,
      lecture: order.lecture,
    };
  }

  /**
   * 지시 목록 조회
   */
  async getOrdersByInstructor(
    instructorId: string,
    query: GetAssistantOrdersQueryDto,
  ) {
    const { workStatus, priority, search, page, limit } = query;

    const { orders, totalCount } =
      await this.assistantOrderRepository.findManyByInstructorId(instructorId, {
        status: workStatus,
        priority,
        search,
        page,
        limit,
      });

    const stats =
      await this.assistantOrderRepository.getStatsByInstructorId(instructorId);

    const mappedOrders = orders.map((order) => this.mapToOrderListItem(order));

    return {
      stats,
      orders: mappedOrders,
      pagination: {
        totalCount,
        page,
        limit,
      },
    };
  }

  /**
   * 지시 목록 조회 (조교용)
   */
  async getOrdersByAssistant(
    assistantId: string,
    query: GetAssistantOrdersQueryDto,
  ) {
    const { workStatus, priority, search, page, limit } = query;

    const { orders, totalCount } =
      await this.assistantOrderRepository.findManyByAssistantId(assistantId, {
        status: workStatus,
        priority,
        search,
        page,
        limit,
      });

    const mappedOrders = orders.map((order) => this.mapToOrderListItem(order));

    return {
      orders: mappedOrders,
      pagination: {
        totalCount,
        page,
        limit,
      },
    };
  }

  private mapToOrderListItem(order: {
    id: string;
    title: string;
    memo: string | null;
    status: string;
    priority: string;
    createdAt: Date;
    deadlineAt: Date | null;
    instructor?: { user: { name: string } };
    assistant?: { name: string };
  }) {
    return {
      id: order.id,
      title: order.title,
      memo: order.memo,
      workStatus: order.status,
      priority: order.priority,
      createdAt: order.createdAt,
      deadlineAt: order.deadlineAt,
      instructorName: order.instructor?.user?.name,
      assistantName: order.assistant?.name,
    };
  }

  /**
   * 지시 수정 (강사 전용 - 전체 수정)
   */
  async updateOrder(
    userType: UserType,
    profileId: string,
    orderId: string,
    data: UpdateAssistantOrderDto,
  ) {
    // 1. 지시 조회 및 권한 검증
    const order = await this.assistantOrderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('지시를 찾을 수 없습니다.');
    }

    if (userType !== UserType.INSTRUCTOR) {
      throw new ForbiddenException('지시 수정 권한이 없습니다.');
    }

    if (order.instructorId !== profileId) {
      throw new ForbiddenException('해당 지시에 대한 접근 권한이 없습니다.');
    }

    // 2. Material 검증 (materialIds가 있는 경우)
    const { materialIds, deadlineAt, workStatus, ...rest } = data;
    const attachments = [];

    if (materialIds && materialIds.length > 0) {
      const materials = await this.materialsRepository.findByIds(materialIds);

      if (materials.length !== materialIds.length) {
        throw new NotFoundException('일부 자료를 찾을 수 없습니다.');
      }

      for (const material of materials) {
        if (material.instructorId !== profileId) {
          throw new ForbiddenException('자료에 대한 접근 권한이 없습니다.');
        }
        attachments.push({
          materialId: material.id,
          filename: material.title,
          fileUrl: material.fileUrl,
        });
      }
    }

    // 3. 업데이트 수행
    return await this.assistantOrderRepository.update(orderId, {
      ...rest,
      status: workStatus,
      deadlineAt: deadlineAt ? new Date(deadlineAt) : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  }

  /**
   * 지시 상태 수정 (조교 전용 - 상태만 수정)
   */
  async updateOrderStatus(
    userType: UserType,
    profileId: string,
    orderId: string,
    workStatus: string,
  ) {
    // 1. 지시 조회 및 권한 검증
    const order = await this.assistantOrderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('지시를 찾을 수 없습니다.');
    }

    if (userType !== UserType.ASSISTANT) {
      throw new ForbiddenException('지시 상태 수정 권한이 없습니다.');
    }

    if (order.assistantId !== profileId) {
      throw new ForbiddenException('해당 지시에 대한 접근 권한이 없습니다.');
    }

    // 2. 상태 업데이트 수행
    return await this.assistantOrderRepository.updateStatus(orderId, workStatus);
  }

  /**
   * 지시 삭제 (강사 전용)
   */
  async deleteOrder(instructorId: string, orderId: string) {
    // 1. 지시 조회 및 권한 검증
    const order = await this.assistantOrderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundException('지시를 찾을 수 없습니다.');
    }

    if (order.instructorId !== instructorId) {
      throw new ForbiddenException('해당 지시에 대한 접근 권한이 없습니다.');
    }

    // 2. 삭제 수행
    await this.assistantOrderRepository.delete(orderId);
  }
}
