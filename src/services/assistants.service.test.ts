import { AssistantsService } from './assistants.service.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { AssistantSignStatus } from '../constants/assistants.constant.js';

// Jest 호환성을 위해 vi 대신 jest 사용
const vi = {
  fn: jest.fn,
};

describe('AssistantsService', () => {
  let service: AssistantsService;
  let mockRepo: Partial<AssistantRepository>;

  beforeEach(() => {
    mockRepo = {
      findManyByInstructorId: vi.fn(),
    };
    service = new AssistantsService(mockRepo as AssistantRepository);
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
});
