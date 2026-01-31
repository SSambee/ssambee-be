import { UserType } from '../constants/auth.constant.js';
import { QuestionType } from '../constants/exams.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { ExamsService } from './exams.service.js';
import {
  createMockExamsRepository,
  createMockLecturesRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import { mockLectures, mockInstructor } from '../test/fixtures/index.js';
import type {
  ExamsRepository,
  ExamWithQuestions,
} from '../repos/exams.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { PermissionService } from './permission.service.js';
import type {
  PrismaClient,
  Prisma,
  Question,
  Exam,
} from '../generated/prisma/client.js';
import type {
  CreateExamDto,
  UpdateExamDto,
} from '../validations/exams.validation.js';

describe('ExamsService - @unit #critical', () => {
  let examsService: ExamsService;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  const mockUserType = UserType.INSTRUCTOR;
  const mockProfileId = mockInstructor.id;
  const mockLecture = mockLectures.basic;
  const mockLectureId = mockLecture.id;
  const mockExamId = 'exam-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockExamsRepo = createMockExamsRepository() as jest.Mocked<ExamsRepository>;
    mockLecturesRepo =
      createMockLecturesRepository() as jest.Mocked<LecturesRepository>;
    mockPermissionService =
      createMockPermissionService() as jest.Mocked<PermissionService>;
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    examsService = new ExamsService(
      mockExamsRepo,
      mockLecturesRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[조회] getExamsByLectureId', () => {
    it('강의 권한이 있는 사용자가 조회를 요청할 때, 강의에 포함된 시험 목록이 반환된다', async () => {
      // Arrange
      const mockExams = [{ id: mockExamId, title: 'Exam 1' }] as Exam[];
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockExamsRepo.findByLectureId.mockResolvedValue(mockExams);

      // Act
      const result = await examsService.getExamsByLectureId(
        mockLectureId,
        mockUserType,
        mockProfileId,
      );

      // Assert
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(mockLectureId);
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(mockExamsRepo.findByLectureId).toHaveBeenCalledWith(mockLectureId);
      expect(result).toEqual(mockExams);
    });

    it('존재하지 않는 강의의 시험 목록을 요청할 때, NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.getExamsByLectureId(
          'invalid-id',
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[조회] getExamById', () => {
    it('시험 권한이 있는 사용자가 상세 조회를 요청할 때, 문항을 포함한 시험 상세 정보가 반환된다', async () => {
      const mockExamWithQuestions = {
        id: mockExamId,
        lectureId: mockLectureId,
        questions: [],
      } as unknown as ExamWithQuestions;

      mockExamsRepo.findByIdWithQuestions.mockResolvedValue(
        mockExamWithQuestions,
      );
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);

      const result = await examsService.getExamById(
        mockExamId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.findByIdWithQuestions).toHaveBeenCalledWith(
        mockExamId,
      );
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(mockLectureId);
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(result).toEqual(mockExamWithQuestions);
    });

    it('존재하지 않는 시험을 조회할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findByIdWithQuestions.mockResolvedValue(null);

      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow('시험을 찾을 수 없습니다.');
    });

    it('시험은 존재하나 관련 강의 정보가 없을 때, NotFoundException을 던진다', async () => {
      const mockExam = { id: mockExamId, lectureId: 'none' } as Exam;
      mockExamsRepo.findByIdWithQuestions.mockResolvedValue(
        mockExam as ExamWithQuestions,
      );
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow('관련 강의를 찾을 수 없습니다.');
    });
  });

  describe('[생성] createExam', () => {
    it('강사가 올바른 정보로 시험 생성을 요청할 때, 문항을 포함한 시험이 성공적으로 생성된다', async () => {
      const createDto: CreateExamDto = {
        title: 'Midterm Exam',
        cutoffScore: 0,
        questions: [
          {
            questionNumber: 1,
            content: 'Q1',
            correctAnswer: 'A',
            score: 10,
            type: QuestionType.MULTIPLE,
          },
        ],
      };

      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockExamsRepo.createWithQuestions.mockResolvedValue({
        id: mockExamId,
        lectureId: mockLectureId,
        instructorId: mockProfileId,
        ...createDto,
      } as unknown as ExamWithQuestions);

      const result = await examsService.createExam(
        mockLectureId,
        createDto,
        mockUserType,
        mockProfileId,
      );

      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(mockLectureId);
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(mockExamsRepo.createWithQuestions).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('존재하지 않는 강의에 시험 생성을 시도할 때, NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.createExam(
          mockLectureId,
          {} as CreateExamDto,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[수정] updateExam', () => {
    it('강사가 올바른 정보로 시험 수정을 요청할 때, 시험 정보와 문항들이 성공적으로 수정 및 생성된다', async () => {
      const mockExam = {
        id: mockExamId,
        lectureId: mockLectureId,
        questions: [],
      } as unknown as ExamWithQuestions;

      const updateDto: UpdateExamDto = {
        title: 'Updated Title',
        cutoffScore: 0,
        questions: [
          {
            id: 'q1',
            questionNumber: 1,
            content: 'Updated Q1',
            score: 10,
            type: QuestionType.MULTIPLE,
            correctAnswer: 'A',
          }, // Update
          {
            content: 'New Q2',
            questionNumber: 2,
            correctAnswer: 'B',
            score: 10,
            type: QuestionType.MULTIPLE,
          }, // Create (no id)
        ],
      };
      const existingQuestions = [
        { id: 'q1' },
        { id: 'q3' },
      ] as unknown as Question[]; // q3 should be deleted

      mockExamsRepo.findById.mockResolvedValue(mockExam as unknown as Exam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockExamsRepo.update.mockResolvedValue(mockExam as unknown as Exam);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(
        existingQuestions as Question[],
      );
      mockExamsRepo.findByIdWithQuestions.mockResolvedValue(
        mockExam as ExamWithQuestions,
      );

      await examsService.updateExam(
        mockExamId,
        updateDto,
        mockUserType,
        mockProfileId,
      );

      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.update).toHaveBeenCalledWith(
        mockExamId,
        updateDto,
        mockPrisma,
      );

      // q3 삭제 확인
      expect(mockExamsRepo.deleteQuestions).toHaveBeenCalledWith(
        ['q3'],
        mockPrisma,
      );

      // q1 수정 확인
      expect(mockExamsRepo.updateQuestion).toHaveBeenCalledWith(
        'q1',
        expect.objectContaining({ content: 'Updated Q1' }),
        mockPrisma,
      );

      // 새 문항 생성 확인
      expect(mockExamsRepo.createQuestion).toHaveBeenCalledWith(
        mockExamId,
        mockLectureId,
        expect.objectContaining({ content: 'New Q2' }),
        mockPrisma,
      );
    });

    it('존재하지 않는 시험 수정을 시도할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.updateExam(
          mockExamId,
          {} as UpdateExamDto,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험은 존재하나 관련 강의 정보가 없을 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue({ id: mockExamId } as Exam);
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.updateExam(
          mockExamId,
          {} as UpdateExamDto,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
