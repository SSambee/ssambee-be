import { UserType } from '../constants/auth.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { GradingStatus } from '../constants/exams.constant.js';
import { ExamsService } from './exams.service.js';
import {
  createMockExamsRepository,
  createMockLecturesRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import type {
  ExamsRepository,
  ExamDetailWithEnrollments,
} from '../repos/exams.repo.js';
import type {
  LecturesRepository,
  LectureDetail,
} from '../repos/lectures.repo.js';
import type { PermissionService } from './permission.service.js';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type {
  CreateExamDto,
  UpdateExamDto,
} from '../validations/exams.validation.js';
import {
  mockInstructor,
  mockLectures,
} from '../test/fixtures/lectures.fixture';
import {
  mockExams,
  mockExamWithQuestions,
  createExamRequests,
  updateExamRequests,
} from '../test/fixtures/exams.fixture';

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
      const exams = [
        {
          ...mockExams.basic,
          subject: null,
          description: null,
          lecture: { title: mockLecture.title },
        },
      ];
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockExamsRepo.findByLectureId.mockResolvedValue(exams);

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
      expect(result).toEqual([
        {
          ...mockExams.basic,
          lectureTitle: mockLecture.title,
        },
      ]);
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
      const examDetail = mockExamWithQuestions.basic as Awaited<
        ReturnType<typeof mockExamsRepo.findByIdWithEnrollments>
      >;

      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(examDetail);
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );

      const result = await examsService.getExamById(
        mockExamId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.findByIdWithEnrollments).toHaveBeenCalledWith(
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
      expect(result).toEqual(examDetail);
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
      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(
        mockExamWithQuestions.basic as Awaited<
          ReturnType<typeof mockExamsRepo.findByIdWithEnrollments>
        >,
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
      const createDto = createExamRequests.basic;

      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockExamsRepo.createWithQuestions.mockResolvedValue({
        ...mockExams.basic,
        subject: null,
        description: null,
        ...createDto,
        questions: [],
      } as Awaited<ReturnType<typeof mockExamsRepo.createWithQuestions>>);

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
      expect(mockExamsRepo.createWithQuestions).toHaveBeenCalledWith(
        mockLectureId,
        mockLecture.instructorId,
        createDto,
        expect.anything(), // tx
      );
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
      const exam = mockExams.basic as NonNullable<
        Awaited<ReturnType<typeof mockExamsRepo.findById>>
      >;
      const lectureDetail = mockLectures.withEnrollments as NonNullable<
        Awaited<ReturnType<typeof mockLecturesRepo.findById>>
      >;
      const updateDto = updateExamRequests.withQuestions;
      const existingQuestions = [
        { id: 'q1', questionNumber: 1 },
        { id: 'q3', questionNumber: 3 },
      ] as Awaited<ReturnType<typeof mockExamsRepo.findQuestionsByExamId>>;

      mockExamsRepo.findById.mockResolvedValue(exam);
      mockLecturesRepo.findById.mockResolvedValue(lectureDetail);
      mockExamsRepo.update.mockResolvedValue(exam);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(existingQuestions);
      mockExamsRepo.findByIdWithQuestions.mockResolvedValue(
        mockExamWithQuestions.withMultiple as Awaited<
          ReturnType<typeof mockExamsRepo.findByIdWithQuestions>
        >,
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
        lectureDetail.instructorId,
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
        expect.objectContaining({
          content: updateDto.questions?.[0].content,
          category: 'UPDATED_CAT',
        }),
        mockPrisma,
      );

      // 새 문항 생성 확인
      expect(mockExamsRepo.createQuestion).toHaveBeenCalledWith(
        mockExamId,
        lectureDetail.id,
        expect.objectContaining({ content: updateDto.questions?.[1].content }),
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
      const exam = { ...mockExams.basic, lectureId: 'none' } as Awaited<
        ReturnType<typeof mockExamsRepo.findById>
      >;
      mockExamsRepo.findById.mockResolvedValue(exam);
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

  describe('getExamById', () => {
    it('should return exam with enrollments', async () => {
      const mockExamWithEnrollments = {
        id: mockExamId,
        lectureId: mockLectureId,
        questions: [],
        enrollments: [
          {
            lectureEnrollmentId: 'le-1',
            studentName: 'Student A',
            schoolYear: 'Year 1',
            hasGrade: true,
            score: 90,
          },
        ],
        lecture: { title: 'Math Class' },
      } as unknown as ExamDetailWithEnrollments;
      const mockLecture = {
        id: mockLectureId,
        instructorId: mockProfileId,
      } as LectureDetail;

      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(
        mockExamWithEnrollments,
      );
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);

      const result = await examsService.getExamById(
        mockExamId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.findByIdWithEnrollments).toHaveBeenCalledWith(
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
      expect(result).toBeDefined();
      expect((result as ExamDetailWithEnrollments).enrollments).toHaveLength(1);
    });

    it('should throw NotFoundException if exam not found', async () => {
      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(null);

      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getExamsByInstructor', () => {
    it('강사가 조회를 요청할 때, 본인의 시험 목록이 반환된다', async () => {
      // Arrange
      const exams = [
        {
          ...mockExams.basic,
          subject: null,
          description: null,
          lecture: { title: 'Math' },
        },
      ] as ExamDetailWithEnrollments[];
      mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
        mockProfileId,
      );
      mockExamsRepo.findByInstructorId.mockResolvedValue(exams);

      // Act
      const result = await examsService.getExamsByInstructor(
        UserType.INSTRUCTOR,
        mockProfileId,
      );

      // Assert
      expect(
        mockPermissionService.getEffectiveInstructorId,
      ).toHaveBeenCalledWith(UserType.INSTRUCTOR, mockProfileId);
      expect(mockExamsRepo.findByInstructorId).toHaveBeenCalledWith(
        mockProfileId,
      );
      expect(result).toEqual([{ ...mockExams.basic, lectureTitle: 'Math' }]);
    });

    it('조교가 조회를 요청할 때, 담당 강사의 시험 목록이 반환된다', async () => {
      // Arrange
      const mockAssistantId = 'assistant-1';
      const exams = [
        {
          ...mockExams.basic,
          subject: null,
          description: null,
          lecture: { title: 'Math' },
        },
      ] as ExamDetailWithEnrollments[];
      mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
        mockProfileId,
      );
      mockExamsRepo.findByInstructorId.mockResolvedValue(exams);

      // Act
      const result = await examsService.getExamsByInstructor(
        UserType.ASSISTANT,
        mockAssistantId,
      );

      // Assert
      expect(
        mockPermissionService.getEffectiveInstructorId,
      ).toHaveBeenCalledWith(UserType.ASSISTANT, mockAssistantId);
      expect(mockExamsRepo.findByInstructorId).toHaveBeenCalledWith(
        mockProfileId,
      );
      expect(result).toEqual([{ ...mockExams.basic, lectureTitle: 'Math' }]);
    });
  });

  describe('[삭제] deleteExam', () => {
    const mockExam = {
      ...mockExams.basic,
      gradingStatus: GradingStatus.PENDING,
    };

    it('시험 상태가 PENDING이고 권한이 있을 때, 시험이 정상적으로 삭제된다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture as LectureDetail);

      await examsService.deleteExam(mockExamId, mockUserType, mockProfileId);

      expect(mockExamsRepo.findById).toHaveBeenCalledWith(mockExamId);
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
        mockExam.lectureId,
      );
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockLecture.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(mockExamsRepo.delete).toHaveBeenCalledWith(mockExamId);
    });

    it('존재하지 않는 시험을 삭제하려 할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.deleteExam(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험은 존재하나 관련 강의 정보가 없을 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        examsService.deleteExam(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험 상태가 PENDING이 아닐 때, BadRequestException을 던진다', async () => {
      const inProgressExam = {
        ...mockExam,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      mockExamsRepo.findById.mockResolvedValue(inProgressExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture as LectureDetail);

      await expect(
        examsService.deleteExam(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
