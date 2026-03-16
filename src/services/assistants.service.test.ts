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

    it('기본적으로 승인된 조교 목록을 반환해야 한다', async () => {
      await service.getAssistantsByInstructor(instructorId);

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.SIGNED,
      );
    });

    it('상태가 대기 중인 조교 목록을 반환해야 한다', async () => {
      await service.getAssistantsByInstructor(instructorId, 'pending');

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.PENDING,
      );
    });

    it('반환해야 한다:  EXPIRED assistants when status is expired', async () => {
      await service.getAssistantsByInstructor(instructorId, 'expired');

      expect(mockRepo.findManyByInstructorId).toHaveBeenCalledWith(
        instructorId,
        AssistantSignStatus.EXPIRED,
      );
    });

    it('반환해야 한다:  REJECTED assistants when status is rejected', async () => {
      await service.getAssistantsByInstructor(instructorId, 'rejected');

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

    it('조교 정보를 성공적으로 수정해야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({ instructorId });

      await service.updateAssistant(id, instructorId, data);

      expect(mockRepo.update).toHaveBeenCalledWith(id, data);
    });

    it('에러를 던져야 한다:  NotFoundException if assistant not found', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAssistant(id, instructorId, data),
      ).rejects.toThrow(NotFoundException);
    });

    it('에러를 던져야 한다:  ForbiddenException if instructorId mismatch', async () => {
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

    it('조교 승인이 성공적으로 완료되어야 한다', async () => {
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

    it('조교를 거절하고 유저를 성공적으로 삭제해야 한다', async () => {
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

    it('조교 계정을 만료시키고 유저를 성공적으로 삭제해야 한다', async () => {
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
