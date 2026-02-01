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
import type {
  ExamsRepository,
  ExamWithQuestions,
} from '../repos/exams.repo.js';
import type {
  LecturesRepository,
  LectureDetail,
} from '../repos/lectures.repo.js';
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

describe('ExamsService', () => {
  let examsService: ExamsService;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  const mockUserType = UserType.INSTRUCTOR;
  const mockProfileId = 'instructor-1';
  const mockLectureId = 'lecture-1';
  const mockExamId = 'exam-1';

  beforeEach(() => {
    mockExamsRepo = createMockExamsRepository() as jest.Mocked<ExamsRepository>;
    mockLecturesRepo =
      createMockLecturesRepository() as jest.Mocked<LecturesRepository>;
    mockPermissionService =
      createMockPermissionService() as jest.Mocked<PermissionService>;
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    // Transaction mock needs to handle the callback
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

  describe('createExam', () => {
    it('should create exam with questions successfully', async () => {
      const mockLecture = {
        id: mockLectureId,
        instructorId: mockProfileId,
        lectureTimes: [],
        instructor: { user: { name: 'Test Instructor' } },
        enrollments: [],
        exams: [],
        _count: { enrollments: 0 },
      } as unknown as LectureDetail;
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

    it('should throw NotFoundException if lecture not found', async () => {
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

  describe('updateExam', () => {
    it('should update exam and upsert questions', async () => {
      const mockExam = {
        id: mockExamId,
        lectureId: mockLectureId,
        questions: [],
      } as unknown as ExamWithQuestions;
      const mockLecture = {
        id: mockLectureId,
        instructorId: mockProfileId,
        lectureTimes: [],
        instructor: { user: { name: 'Test Instructor' } },
        enrollments: [],
        exams: [],
        _count: { enrollments: 0 },
      } as unknown as LectureDetail;
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

      // Verify Permission Check
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );

      // Verify Update
      expect(mockExamsRepo.update).toHaveBeenCalledWith(
        mockExamId,
        updateDto,
        mockPrisma,
      );

      // Verify Delete (q3)
      expect(mockExamsRepo.deleteQuestions).toHaveBeenCalledWith(
        ['q3'],
        mockPrisma,
      );

      // Verify Update (q1)
      expect(mockExamsRepo.updateQuestion).toHaveBeenCalledWith(
        'q1',
        expect.objectContaining({ content: 'Updated Q1' }),
        mockPrisma,
      );

      // Verify Create (New Q2)
      expect(mockExamsRepo.createQuestion).toHaveBeenCalledWith(
        mockExamId,
        mockLectureId,
        expect.objectContaining({ content: 'New Q2' }),
        mockPrisma,
      );
    });
  });
});
