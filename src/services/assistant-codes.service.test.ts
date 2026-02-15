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
      findValidCode: vi.fn(),
    };
    mockPrisma = {};
    service = new AssistantCodesService(
      mockRepo as AssistantCodeRepository,
      mockPrisma as PrismaClient,
    );
  });

  describe('createCode', () => {
    it('6자리 코드를 생성하고 만료일과 함께 저장해야 한다', async () => {
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

      // 만료일이 대략 24시간 후인지 확인
      const callArgs = (mockRepo.create as jest.Mock).mock.calls[0][0];
      const now = new Date();
      const expireAt = callArgs.expireAt;
      const diffHours = (expireAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(diffHours).toBeCloseTo(24, 0); // 약 24시간
    });
  });

  describe('getCodesByInstructor', () => {
    it('특정 강사의 인증 코드 목록을 반환해야 한다', async () => {
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

  describe('validateCode', () => {
    it('유효한 인증 코드인 경우 true를 반환해야 한다', async () => {
      const code = 'VALID1';
      (mockRepo.findValidCode as jest.Mock).mockResolvedValue({
        id: 'code-1',
        code,
      });

      const result = await service.validateCode(code);

      expect(result).toBe(true);
      expect(mockRepo.findValidCode).toHaveBeenCalledWith(code);
    });

    it('유효하지 않은 인증 코드인 경우 false를 반환해야 한다', async () => {
      const code = 'INVALI';
      (mockRepo.findValidCode as jest.Mock).mockResolvedValue(null);

      const result = await service.validateCode(code);

      expect(result).toBe(false);
      expect(mockRepo.findValidCode).toHaveBeenCalledWith(code);
    });
  });
});
