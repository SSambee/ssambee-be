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
import type { LecturesRepository } from '../repos/lectures.repo.js';
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
      // 준비
      const exams = [
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.PENDING,
          subject: null,
          description: null,
          lecture: { title: mockLecture.title },
          _count: { clinics: 1 },
        },
      ];
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockExamsRepo.findByLectureId.mockResolvedValue(exams);

      // 실행
      const result = await examsService.getExamsByLectureId(
        mockLectureId,
        mockUserType,
        mockProfileId,
      );

      // 검증
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
          gradingStatus: GradingStatus.PENDING,
          lectureTitle: mockLecture.title,
          hasClinic: false, // PENDING이므로 false
        },
      ]);
    });

    it('시험이 COMPLETED 상태이고 미완료 클리닉이 있으면 hasClinic이 true로 반환된다', async () => {
      // 준비
      const exams = [
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.COMPLETED,
          lecture: { title: mockLecture.title },
          _count: { clinics: 1 },
        },
      ];
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockExamsRepo.findByLectureId.mockResolvedValue(exams);

      // 실행
      const result = await examsService.getExamsByLectureId(
        mockLectureId,
        mockUserType,
        mockProfileId,
      );

      // 검증
      expect(result[0].hasClinic).toBe(true);
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

      const result = await examsService.getExamById(
        mockExamId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.findByIdWithEnrollments).toHaveBeenCalledWith(
        mockExamId,
      );
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        examDetail!.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(result).toEqual(examDetail);
    });

    it('존재하지 않는 시험을 조회할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(null);

      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow('시험을 찾을 수 없습니다.');
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
      const updateDto = updateExamRequests.withQuestions;
      const existingQuestions = [
        { id: 'q1', questionNumber: 1 },
        { id: 'q3', questionNumber: 3 },
      ] as Awaited<ReturnType<typeof mockExamsRepo.findQuestionsByExamId>>;

      mockExamsRepo.findById.mockResolvedValue(exam);
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
      ).toHaveBeenCalledWith(exam.instructorId, mockUserType, mockProfileId);

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

      // 새 문항 생성 확인 (exam.lectureId 사용)
      expect(mockExamsRepo.createQuestion).toHaveBeenCalledWith(
        mockExamId,
        exam.lectureId,
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
  });

  describe('getExamById', () => {
    it('반환해야 한다:  exam with enrollments', async () => {
      const mockExamWithEnrollments = {
        id: mockExamId,
        lectureId: mockLectureId,
        instructorId: mockProfileId,
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

      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(
        mockExamWithEnrollments,
      );

      const result = await examsService.getExamById(
        mockExamId,
        mockUserType,
        mockProfileId,
      );

      expect(mockExamsRepo.findByIdWithEnrollments).toHaveBeenCalledWith(
        mockExamId,
      );
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockExamWithEnrollments.instructorId,
        mockUserType,
        mockProfileId,
      );
      expect(result).toBeDefined();
      expect((result as ExamDetailWithEnrollments).enrollments).toHaveLength(1);
    });

    it('에러를 던져야 한다:  NotFoundException if exam not found', async () => {
      mockExamsRepo.findByIdWithEnrollments.mockResolvedValue(null);

      await expect(
        examsService.getExamById(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getExamsByInstructor', () => {
    it('강사가 조회를 요청할 때, 본인의 시험 목록이 반환된다', async () => {
      // 준비
      const exams = [
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.COMPLETED,
          subject: null,
          description: null,
          lecture: { title: 'Math' },
          _count: { clinics: 2 },
        },
      ] as Awaited<ReturnType<ExamsRepository['findByInstructorId']>>;
      mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
        mockProfileId,
      );
      mockExamsRepo.findByInstructorId.mockResolvedValue(exams);

      // 실행
      const result = await examsService.getExamsByInstructor(
        UserType.INSTRUCTOR,
        mockProfileId,
      );

      // 검증
      expect(
        mockPermissionService.getEffectiveInstructorId,
      ).toHaveBeenCalledWith(UserType.INSTRUCTOR, mockProfileId);
      expect(mockExamsRepo.findByInstructorId).toHaveBeenCalledWith(
        mockProfileId,
      );
      expect(result).toEqual([
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.COMPLETED,
          lectureTitle: 'Math',
          hasClinic: true,
        },
      ]);
    });

    it('조교가 조회를 요청할 때, 담당 강사의 시험 목록이 반환된다', async () => {
      // 준비
      const mockAssistantId = 'assistant-1';
      const exams = [
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.PENDING,
          subject: null,
          description: null,
          lecture: { title: 'Math' },
          _count: { clinics: 0 },
        },
      ] as Awaited<ReturnType<ExamsRepository['findByInstructorId']>>;
      mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
        mockProfileId,
      );
      mockExamsRepo.findByInstructorId.mockResolvedValue(exams);

      // 실행
      const result = await examsService.getExamsByInstructor(
        UserType.ASSISTANT,
        mockAssistantId,
      );

      // 검증
      expect(
        mockPermissionService.getEffectiveInstructorId,
      ).toHaveBeenCalledWith(UserType.ASSISTANT, mockAssistantId);
      expect(mockExamsRepo.findByInstructorId).toHaveBeenCalledWith(
        mockProfileId,
      );
      expect(result).toEqual([
        {
          ...mockExams.basic,
          gradingStatus: GradingStatus.PENDING,
          lectureTitle: 'Math',
          hasClinic: false,
        },
      ]);
    });
  });

  describe('[삭제] deleteExam', () => {
    const mockExam = {
      ...mockExams.basic,
      gradingStatus: GradingStatus.PENDING,
    };

    it('시험 상태가 PENDING이고 권한이 있을 때, 시험이 정상적으로 삭제된다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);

      await examsService.deleteExam(mockExamId, mockUserType, mockProfileId);

      expect(mockExamsRepo.findById).toHaveBeenCalledWith(mockExamId);
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith(
        mockExam.instructorId,
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

    it('시험 상태가 PENDING이 아닐 때, BadRequestException을 던진다', async () => {
      const inProgressExam = {
        ...mockExam,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      mockExamsRepo.findById.mockResolvedValue(inProgressExam);

      await expect(
        examsService.deleteExam(mockExamId, mockUserType, mockProfileId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
