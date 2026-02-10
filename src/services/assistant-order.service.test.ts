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
});
