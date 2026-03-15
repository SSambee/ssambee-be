import { AssistantOrderService } from './assistant-order.service.js';
import { AssistantOrderRepository } from '../repos/assistant-order.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { CreateAssistantOrderDto } from '../validations/assistant-order.validation.js';
import { UserType } from '../constants/auth.constant.js';

// Jest 호환성을 위해 vi 대신 jest 사용
const vi = {
  fn: jest.fn,
};

describe('AssistantOrderService', () => {
  let service: AssistantOrderService;
  let mockOrderRepo: Partial<AssistantOrderRepository>;
  let mockAssistantRepo: Partial<AssistantRepository>;
  let mockMaterialsRepo: Partial<MaterialsRepository>;
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    mockOrderRepo = {
      create: vi.fn(),
      findManyByInstructorId: vi.fn(),
      getStatsByInstructorId: vi.fn(),
      findManyByAssistantId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      delete: vi.fn(),
    };
    mockAssistantRepo = {
      findById: vi.fn(),
    };
    mockMaterialsRepo = {
      findByIds: vi.fn(),
    };
    mockPrisma = {};

    service = new AssistantOrderService(
      mockOrderRepo as AssistantOrderRepository,
      mockAssistantRepo as AssistantRepository,
      mockMaterialsRepo as MaterialsRepository,
      mockPrisma as PrismaClient,
    );
  });

  describe('createOrder', () => {
    const instructorId = 'inst-1';
    const assistantId = 'asst-1';
    const validData: CreateAssistantOrderDto = {
      assistantId,
      title: 'Task 1',
      memo: 'Do this',
      priority: 'NORMAL',
      materialIds: ['mat-1'],
    };

    it('요청를 성공적으로 생성해야 한다', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue({
        id: assistantId,
        instructorId,
      });
      (mockMaterialsRepo.findByIds as jest.Mock).mockResolvedValue([
        { id: 'mat-1', instructorId, title: 'Material 1', fileUrl: 'url' },
      ]);
      (mockOrderRepo.create as jest.Mock).mockResolvedValue({
        id: 'order-1',
        ...validData,
      });

      await service.createOrder(instructorId, validData);

      expect(mockAssistantRepo.findById).toHaveBeenCalledWith(assistantId);
      expect(mockMaterialsRepo.findByIds).toHaveBeenCalledWith(['mat-1']);
      expect(mockOrderRepo.create).toHaveBeenCalledWith(instructorId, {
        title: 'Task 1',
        memo: 'Do this',
        priority: 'NORMAL',
        assistantId,
        deadlineAt: undefined,
        attachments: [
          {
            materialId: 'mat-1',
            filename: 'Material 1',
            fileUrl: 'url',
          },
        ],
      });
    });

    it('조교를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createOrder(instructorId, validData),
      ).rejects.toThrow(NotFoundException);
    });

    it('다른 강사의 조교이면 ForbiddenException을 던져야 한다', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue({
        id: assistantId,
        instructorId: 'other-inst',
      });

      await expect(
        service.createOrder(instructorId, validData),
      ).rejects.toThrow(ForbiddenException);
    });

    it('다른 강사의 자료이면 ForbiddenException을 던져야 한다', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue({
        id: assistantId,
        instructorId,
      });
      (mockMaterialsRepo.findByIds as jest.Mock).mockResolvedValue([
        { id: 'mat-1', instructorId: 'other-inst', title: 'Mat 1' },
      ]);

      await expect(
        service.createOrder(instructorId, validData),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getOrdersByInstructor', () => {
    const instructorId = 'inst-1';

    it('페이지네이션과 통계와 함께 요청들을 반환해야 한다', async () => {
      const mockOrders = [
        {
          id: '1',
          title: 'Order 1',
          status: 'PENDING',
          instructor: { user: { name: 'Inst' } },
          assistant: { name: 'Asst' },
        },
        {
          id: '2',
          title: 'Order 2',
          status: 'END',
          instructor: { user: { name: 'Inst' } },
          assistant: { name: 'Asst' },
        },
      ];
      const mockTotalCount = 2;
      const mockStats = {
        totalCount: 10,
        inProgressCount: 5,
        completedCount: 5,
      };

      (mockOrderRepo.findManyByInstructorId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });
      (mockOrderRepo.getStatsByInstructorId as jest.Mock).mockResolvedValue(
        mockStats,
      );

      const query = { page: 1, limit: 10 };
      const result = await service.getOrdersByInstructor(instructorId, query);

      expect(mockOrderRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        {
          status: undefined,
          priority: undefined,
          search: undefined,
          page: 1,
          limit: 10,
        },
      );
      expect(mockOrderRepo.getStatsByInstructorId).toHaveBeenCalledWith(
        instructorId,
      );
      expect(result.orders[0]).toHaveProperty('workStatus', 'PENDING');
      expect(result.orders[0]).toHaveProperty('instructorName', 'Inst');
      expect(result.pagination.totalCount).toBe(mockTotalCount);
    });

    it('상태, 중요도, 검색어로 필터링해야 한다', async () => {
      const mockOrders = [{ id: '1', title: 'Order 1' }];
      const mockTotalCount = 1;

      (mockOrderRepo.findManyByInstructorId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });

      const query = {
        workStatus: 'PENDING',
        priority: 'HIGH',
        search: 'Task',
        page: 1,
        limit: 10,
      } as const;
      await service.getOrdersByInstructor(instructorId, query);

      expect(mockOrderRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        {
          status: 'PENDING',
          priority: 'HIGH',
          search: 'Task',
          page: 1,
          limit: 10,
        },
      );
    });
  });

  describe('getOrdersByAssistant', () => {
    const assistantId = 'asst-1';

    it('조교용 요청들을 페이지네이션과 함께 반환해야 한다', async () => {
      const mockOrders = [
        {
          id: '1',
          title: 'Order 1',
          status: 'PENDING',
          instructor: { user: { name: 'Inst' } },
          assistant: { name: 'Asst' },
        },
      ];
      const mockTotalCount = 1;

      (mockOrderRepo.findManyByAssistantId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });

      const query = { page: 1, limit: 10 };
      const result = await service.getOrdersByAssistant(assistantId, query);

      expect(mockOrderRepo.findManyByAssistantId).toHaveBeenCalledWith(
        assistantId,
        {
          status: undefined,
          priority: undefined,
          search: undefined,
          page: 1,
          limit: 10,
        },
      );
      expect(result.orders[0]).toHaveProperty('workStatus', 'PENDING');
      expect(result.pagination.totalCount).toBe(mockTotalCount);
    });

    it('상태, 중요도, 검색어로 필터링해야 한다', async () => {
      const mockOrders = [{ id: '1', title: 'Order 1' }];
      const mockTotalCount = 1;

      (mockOrderRepo.findManyByAssistantId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });

      const query = {
        workStatus: 'PENDING',
        priority: 'HIGH',
        search: 'Task',
        page: 1,
        limit: 10,
      } as const;
      await service.getOrdersByAssistant(assistantId, query);

      expect(mockOrderRepo.findManyByAssistantId).toHaveBeenCalledWith(
        assistantId,
        {
          status: 'PENDING',
          priority: 'HIGH',
          search: 'Task',
          page: 1,
          limit: 10,
        },
      );
    });
  });

  describe('getOrderById', () => {
    const instructorId = 'inst-1';
    const assistantId = 'asst-1';
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      instructorId,
      assistantId,
      title: 'Task',
      status: 'PENDING',
      instructor: {
        id: instructorId,
        user: { name: 'Instructor Name' },
      },
      assistant: {
        id: assistantId,
        name: 'Assistant Name',
      },
    };

    it('강사용 요청을 반환해야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        UserType.INSTRUCTOR,
        instructorId,
        orderId,
      );

      expect(result).toEqual({
        id: orderId,
        title: 'Task',
        memo: undefined,
        workStatus: 'PENDING',
        priority: undefined,
        createdAt: undefined,
        deadlineAt: undefined,
        instructor: {
          id: instructorId,
          name: 'Instructor Name',
        },
        assistant: {
          id: assistantId,
          name: 'Assistant Name',
        },
        attachments: undefined,
        lecture: undefined,
      });
    });

    it('조교용 요청을 반환해야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        UserType.ASSISTANT,
        assistantId,
        orderId,
      );

      expect(result).toEqual({
        id: orderId,
        title: 'Task',
        memo: undefined,
        workStatus: 'PENDING',
        priority: undefined,
        createdAt: undefined,
        deadlineAt: undefined,
        instructor: {
          id: instructorId,
          name: 'Instructor Name',
        },
        assistant: {
          id: assistantId,
          name: 'Assistant Name',
        },
        attachments: undefined,
        lecture: undefined,
      });
    });

    it('요청를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getOrderById(UserType.INSTRUCTOR, instructorId, orderId),
      ).rejects.toThrow(NotFoundException);
    });

    it('강사가 다른 강사의 요청을 접근하면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.getOrderById(UserType.INSTRUCTOR, 'other-inst', orderId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 다른 조교의 요청을 접근하면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.getOrderById(UserType.ASSISTANT, 'other-asst', orderId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateOrder', () => {
    const instructorId = 'inst-1';
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      instructorId,
      assistantId: 'asst-1',
    };

    const updateData = {
      title: 'Updated Title',
      workStatus: 'IN_PROGRESS',
    };

    it('요청를 성공적으로 수정해야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);
      (mockOrderRepo.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        title: updateData.title,
        status: updateData.workStatus,
      });

      await service.updateOrder(
        UserType.INSTRUCTOR,
        instructorId,
        orderId,
        updateData,
      );

      expect(mockOrderRepo.update).toHaveBeenCalledWith(orderId, {
        title: updateData.title,
        status: updateData.workStatus,
        deadlineAt: undefined,
        attachments: undefined,
      });
    });

    it('사용자가 강사가 아니면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.updateOrder(UserType.ASSISTANT, 'asst-1', orderId, updateData),
      ).rejects.toThrow(ForbiddenException);
    });

    it('강사가 다른 강사의 요청을 수정하면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.updateOrder(
          UserType.INSTRUCTOR,
          'other-inst',
          orderId,
          updateData,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateOrderStatus', () => {
    const assistantId = 'asst-1';
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      instructorId: 'inst-1',
      assistantId,
    };

    it('상태를 성공적으로 수정해야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);
      (mockOrderRepo.updateStatus as jest.Mock).mockResolvedValue({
        ...mockOrder,
        status: 'IN_PROGRESS',
      });

      await service.updateOrderStatus(
        UserType.ASSISTANT,
        assistantId,
        orderId,
        'IN_PROGRESS',
      );

      expect(mockOrderRepo.updateStatus).toHaveBeenCalledWith(
        orderId,
        'IN_PROGRESS',
      );
    });

    it('사용자가 조교가 아니면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.updateOrderStatus(
          UserType.INSTRUCTOR,
          'inst-1',
          orderId,
          'IN_PROGRESS',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 다른 조교의 요청 상태를 수정하면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.updateOrderStatus(
          UserType.ASSISTANT,
          'other-asst',
          orderId,
          'IN_PROGRESS',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteOrder', () => {
    const instructorId = 'inst-1';
    const orderId = 'order-1';
    const mockOrder = {
      id: orderId,
      instructorId,
    };

    it('요청를 성공적으로 삭제해야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await service.deleteOrder(instructorId, orderId);

      expect(mockOrderRepo.delete).toHaveBeenCalledWith(orderId);
    });

    it('강사가 다른 강사의 요청을 삭제하면 ForbiddenException을 던져야 한다', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(service.deleteOrder('other-inst', orderId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
