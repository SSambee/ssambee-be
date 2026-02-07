import { AssistantCodesService } from './assistant-codes.service.js';
import { AssistantCodeRepository } from '../repos/assistant-code.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';

// Jest 호환성을 위해 vi 대신 jest 사용, mockResolvedValue 등은 동일
const vi = {
  fn: jest.fn,
};

describe('AssistantCodesService', () => {
  let service: AssistantCodesService;
  let mockRepo: Partial<AssistantCodeRepository>;
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findByInstructorId: vi.fn(),
    };
    mockPrisma = {};
    service = new AssistantCodesService(
      mockRepo as AssistantCodeRepository,
      mockPrisma as PrismaClient,
    );
  });

  describe('createCode', () => {
    it('should create a 6-character code and save it with expiration', async () => {
      const instructorId = 'inst-1';
      const mockCreatedCode = {
        id: 'code-1',
        code: '123456',
        instructorId,
        isUsed: false,
        expireAt: new Date(),
        createdAt: new Date(),
      };

      (mockRepo.create as jest.Mock).mockResolvedValue(mockCreatedCode);

      const result = await service.createCode(instructorId);

      expect(result).toBe(mockCreatedCode);
      expect(mockRepo.create).toHaveBeenCalledWith({
        code: expect.stringMatching(/^[a-zA-Z0-9]{6}$/), // 6자리 숫자+문자
        instructorId,
        expireAt: expect.any(Date),
      });

      // 유효기간이 대략 24시간 뒤인지 확인
      const callArgs = (mockRepo.create as jest.Mock).mock.calls[0][0];
      const now = new Date();
      const expireAt = callArgs.expireAt;
      const diffHours = (expireAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0); // 24시간 근사치
    });
  });

  describe('getCodesByInstructor', () => {
    it('should return list of codes for the instructor', async () => {
      const instructorId = 'inst-1';
      const mockCodes = [
        { id: 'code-1', code: '123456', instructorId },
        { id: 'code-2', code: 'abcdef', instructorId },
      ];

      (mockRepo.findByInstructorId as jest.Mock).mockResolvedValue(mockCodes);

      const result = await service.getCodesByInstructor(instructorId);

      expect(result).toBe(mockCodes);
      expect(mockRepo.findByInstructorId).toHaveBeenCalledWith(instructorId);
    });
  });
});
