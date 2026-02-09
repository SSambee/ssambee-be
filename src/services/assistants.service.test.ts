import { AssistantsService } from './assistants.service.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { AssistantSignStatus } from '../constants/assistants.constant.js';
import { AuthService } from './auth.service.js';
import { PrismaClient, type Prisma } from '../generated/prisma/client.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

// Jest 호환성을 위해 vi 대신 jest 사용
const vi = {
  fn: jest.fn,
};

describe('AssistantsService', () => {
  let service: AssistantsService;
  let mockRepo: Partial<AssistantRepository>;
  let mockAuthService: Partial<AuthService>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockRepo = {
      findManyByInstructorId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      updateSignStatus: vi.fn(),
      softDelete: vi.fn(),
    };
    mockAuthService = {
      deleteUserById: vi.fn(),
    };
    mockPrisma = {
      $transaction: vi
        .fn()
        .mockImplementation(
          <T>(
            callback: (tx: Prisma.TransactionClient) => Promise<T>,
          ): Promise<T> =>
            callback(mockPrisma as unknown as Prisma.TransactionClient),
        ),
    } as unknown as PrismaClient;

    service = new AssistantsService(
      mockRepo as AssistantRepository,
      mockAuthService as AuthService,
      mockPrisma,
    );
  });

  describe('getAssistantsByInstructor', () => {
    const instructorId = 'inst-1';

    it('should return SIGNED assistants by default', async () => {
      await service.getAssistantsByInstructor(instructorId);

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.SIGNED,
      );
    });

    it('should return PENDING assistants when status is pending', async () => {
      await service.getAssistantsByInstructor(instructorId, 'pending');

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.PENDING,
      );
    });

    it('should return EXPIRED assistants when status is expired', async () => {
      await service.getAssistantsByInstructor(instructorId, 'expired');

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.EXPIRED,
      );
    });

    it('should return REJECTED assistants when status is denied', async () => {
      await service.getAssistantsByInstructor(instructorId, 'denied');

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.REJECTED,
      );
    });
  });

  describe('updateAssistant', () => {
    const id = 'ast-1';
    const instructorId = 'inst-1';
    const data = { name: 'New Name' };

    it('should update assistant info successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({ instructorId });

      await service.updateAssistant(id, instructorId, data);

      expect(mockRepo.update).toHaveBeenCalledWith(id, data);
    });

    it('should throw NotFoundException if assistant not found', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAssistant(id, instructorId, data),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructorId mismatch', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        instructorId: 'other-inst',
      });

      await expect(
        service.updateAssistant(id, instructorId, data),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approveAssistant', () => {
    const id = 'ast-1';
    const instructorId = 'inst-1';

    it('should approve assistant successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({ instructorId });

      await service.approveAssistant(id, instructorId);

      expect(mockRepo.updateSignStatus).toHaveBeenCalledWith(
        id,
        AssistantSignStatus.SIGNED,
      );
    });
  });

  describe('rejectAssistant', () => {
    const id = 'ast-1';
    const instructorId = 'inst-1';
    const userId = 'user-1';

    it('should reject assistant and delete user successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        instructorId,
        userId,
        signStatus: AssistantSignStatus.PENDING,
      });

      await service.rejectAssistant(id, instructorId, {});

      expect(mockAuthService.deleteUserById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );
      expect(mockRepo.updateSignStatus).toHaveBeenCalledWith(
        id,
        AssistantSignStatus.REJECTED,
        mockPrisma,
      );
      expect(mockRepo.softDelete).toHaveBeenCalledWith(id, mockPrisma);
    });

    it('should reject assistant without userId successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        instructorId,
        userId: null,
      });

      await service.rejectAssistant(id, instructorId, {});

      expect(mockAuthService.deleteUserById).not.toHaveBeenCalled();
      expect(mockRepo.updateSignStatus).toHaveBeenCalled();
      expect(mockRepo.softDelete).toHaveBeenCalled();
    });
  });

  describe('expireAssistant', () => {
    const id = 'ast-1';
    const instructorId = 'inst-1';
    const userId = 'user-1';

    it('should expire assistant and delete user successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        instructorId,
        userId,
      });

      await service.expireAssistant(id, instructorId, {});

      expect(mockAuthService.deleteUserById).toHaveBeenCalledWith(
        userId,
        expect.anything(),
      );
      expect(mockRepo.updateSignStatus).toHaveBeenCalledWith(
        id,
        AssistantSignStatus.EXPIRED,
        mockPrisma,
      );
      expect(mockRepo.softDelete).toHaveBeenCalledWith(id, mockPrisma);
    });
  });
});
