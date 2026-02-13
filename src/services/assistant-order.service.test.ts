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

    it('should create order successfully', async () => {
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

    it('should throw NotFoundException if assistant not found', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createOrder(instructorId, validData),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if assistant belongs to another instructor', async () => {
      (mockAssistantRepo.findById as jest.Mock).mockResolvedValue({
        id: assistantId,
        instructorId: 'other-inst',
      });

      await expect(
        service.createOrder(instructorId, validData),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if material belongs to another instructor', async () => {
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

    it('should return orders with pagination and stats', async () => {
      const mockOrders = [
        { id: '1', title: 'Order 1' },
        { id: '2', title: 'Order 2' },
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
          page: 1,
          limit: 10,
        },
      );
      expect(mockOrderRepo.getStatsByInstructorId).toHaveBeenCalledWith(
        instructorId,
      );
      expect(result).toEqual({
        stats: mockStats,
        orders: mockOrders,
        pagination: {
          totalCount: mockTotalCount,
          page: 1,
          limit: 10,
        },
      });
    });

    it('should filter by status', async () => {
      const mockOrders = [{ id: '1', title: 'Order 1' }];
      const mockTotalCount = 1;

      (mockOrderRepo.findManyByInstructorId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });

      const query = { status: 'PENDING', page: 1, limit: 10 } as const;
      await service.getOrdersByInstructor(instructorId, query);

      expect(mockOrderRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        {
          status: 'PENDING',
          page: 1,
          limit: 10,
        },
      );
    });
  });

  describe('getOrdersByAssistant', () => {
    const assistantId = 'asst-1';

    it('should return orders with pagination', async () => {
      const mockOrders = [
        { id: '1', title: 'Order 1' },
        { id: '2', title: 'Order 2' },
      ];
      const mockTotalCount = 2;

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
          page: 1,
          limit: 10,
        },
      );
      expect(result).toEqual({
        orders: mockOrders,
        pagination: {
          totalCount: mockTotalCount,
          page: 1,
          limit: 10,
        },
      });
    });

    it('should filter by status', async () => {
      const mockOrders = [{ id: '1', title: 'Order 1' }];
      const mockTotalCount = 1;

      (mockOrderRepo.findManyByAssistantId as jest.Mock).mockResolvedValue({
        orders: mockOrders,
        totalCount: mockTotalCount,
      });

      const query = { status: 'PENDING', page: 1, limit: 10 } as const;
      await service.getOrdersByAssistant(assistantId, query);

      expect(mockOrderRepo.findManyByAssistantId).toHaveBeenCalledWith(
        assistantId,
        {
          status: 'PENDING',
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
      instructor: {
        id: instructorId,
        user: { name: 'Instructor Name' },
      },
    };

    it('should return order for instructor', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        UserType.INSTRUCTOR,
        instructorId,
        orderId,
      );

      expect(result).toEqual({
        ...mockOrder,
        instructor: {
          id: instructorId,
          name: 'Instructor Name',
        },
      });
    });

    it('should return order for assistant', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      const result = await service.getOrderById(
        UserType.ASSISTANT,
        assistantId,
        orderId,
      );

      expect(result).toEqual({
        ...mockOrder,
        instructor: {
          id: instructorId,
          name: 'Instructor Name',
        },
      });
    });

    it('should throw NotFoundException if order not found', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getOrderById(UserType.INSTRUCTOR, instructorId, orderId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor accesses other orders', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.getOrderById(UserType.INSTRUCTOR, 'other-inst', orderId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if assistant accesses other orders', async () => {
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
    };

    it('should update order successfully', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);
      (mockOrderRepo.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        ...updateData,
      });

      await service.updateOrder(
        UserType.INSTRUCTOR,
        instructorId,
        orderId,
        updateData,
      );

      expect(mockOrderRepo.update).toHaveBeenCalledWith(orderId, {
        ...updateData,
        deadlineAt: undefined,
        attachments: undefined,
      });
    });

    it('should throw ForbiddenException if user is not instructor', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(
        service.updateOrder(UserType.ASSISTANT, 'asst-1', orderId, updateData),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if instructor updates other order', async () => {
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

    it('should update status successfully', async () => {
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

    it('should throw ForbiddenException if user is not assistant', async () => {
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

    it('should throw ForbiddenException if assistant updates other order', async () => {
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

    it('should delete order successfully', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await service.deleteOrder(instructorId, orderId);

      expect(mockOrderRepo.delete).toHaveBeenCalledWith(orderId);
    });

    it('should throw ForbiddenException if instructor deletes other order', async () => {
      (mockOrderRepo.findById as jest.Mock).mockResolvedValue(mockOrder);

      await expect(service.deleteOrder('other-inst', orderId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
