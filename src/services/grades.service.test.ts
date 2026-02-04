import { UserType } from '../constants/auth.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { GradesService } from './grades.service.js';
import {
  createMockGradesRepository,
  createMockExamsRepository,
  createMockLecturesRepository,
  createMockLectureEnrollmentsRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import {
  mockLectures,
  mockInstructor,
  mockExams,
  mockQuestions,
  mockGrades,
  submitGradingRequests,
} from '../test/fixtures/index.js';
import type { GradesRepository } from '../repos/grades.repo.js';
import type { ExamsRepository } from '../repos/exams.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { PermissionService } from './permission.service.js';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('GradesService - @unit #critical', () => {
  let gradesService: GradesService;
  let mockGradesRepo: jest.Mocked<GradesRepository>;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockLectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  const mockUserType = UserType.INSTRUCTOR;
  const mockProfileId = mockInstructor.id;
  const mockLecture = mockLectures.basic;
  const mockExam = mockExams.basic;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGradesRepo = createMockGradesRepository();
    mockExamsRepo = createMockExamsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    gradesService = new GradesService(
      mockGradesRepo,
      mockExamsRepo,
      mockLecturesRepo,
      mockLectureEnrollmentsRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[채점] submitGrading', () => {
    it('강사가 올바른 정보로 채점 결과를 제출할 때, 점수 계산이 정확하면 제출이 성공하고 성적 정보가 반환된다', async () => {
      // Arrange
      const data = submitGradingRequests.basic;
      const mockQuestionsList = [
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ];

      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);
      mockGradesRepo.upsertGrade.mockResolvedValue(mockGrades.basic);

      // Act
      const result = await gradesService.submitGrading(
        mockExam.id,
        data,
        mockUserType,
        mockProfileId,
      );

      // Assert
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(mockExam.id);
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
        mockExam.lectureId,
      );
      expect(mockPermissionService.validateInstructorAccess).toHaveBeenCalled();
      expect(mockGradesRepo.upsertStudentAnswers).toHaveBeenCalled();
      expect(mockGradesRepo.upsertGrade).toHaveBeenCalledWith(
        mockExam.lectureId,
        mockExam.id,
        data.lectureEnrollmentId,
        data.totalScore,
        data.totalScore >= mockExam.cutoffScore,
        mockPrisma,
      );
      expect(result).toBeDefined();
    });

    it('서술형 문항이 포함된 경우, 서버 자동 채점 없이 클라이언트의 판정을 신뢰하여 제출된다', async () => {
      const data = submitGradingRequests.withEssay;
      const mockQuestionsList = [mockQuestions.essay];

      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-essay',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);

      await gradesService.submitGrading(
        mockExam.id,
        data,
        mockUserType,
        mockProfileId,
      );

      expect(mockGradesRepo.upsertGrade).toHaveBeenCalledWith(
        mockExam.lectureId,
        mockExam.id,
        data.lectureEnrollmentId,
        data.totalScore,
        data.totalScore >= mockExam.cutoffScore,
        mockPrisma,
      );
    });

    it('이미 채점이 완료된 시험에 제출을 시도할 때에도 제출이 성공한다', async () => {
      const completedExam = {
        ...mockExam,
        gradingStatus: GradingStatus.COMPLETED,
      } as Awaited<ReturnType<typeof mockExamsRepo.findById>>;
      const data = submitGradingRequests.basic;
      const mockQuestionsList = [
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ];

      mockExamsRepo.findById.mockResolvedValue(completedExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(mockQuestionsList);
      mockGradesRepo.upsertGrade.mockResolvedValue(mockGrades.basic);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).resolves.toBeDefined();
    });

    it('객관식 문항의 정답이 서버 데이터와 일치하지 않을 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          {
            questionId: mockQuestions.multipleChoice.id,
            submittedAnswer: 'B', // 실제 정답은 'A'
            isCorrect: true, // 클라이언트는 정답이라고 주장
          },
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('클라이언트가 계산한 총점이 서버에서 계산한 총점과 다를 때, BadRequestException을 던진다', async () => {
      const data = { ...submitGradingRequests.basic, totalScore: 999 }; // 잘못된 총점
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('중복된 문항 ID가 제출될 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          submitGradingRequests.basic.answers[0],
          submitGradingRequests.basic.answers[0], // 중복
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('문항 1번의 답안이 중복 제출되었습니다.');
    });

    it('유효하지 않은 문항 ID가 제출될 때, BadRequestException을 던진다', async () => {
      const data = {
        ...submitGradingRequests.basic,
        answers: [
          {
            ...submitGradingRequests.basic.answers[0],
            questionId: 'invalid-q-id',
          },
        ],
      };
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('해당 시험에 존재하지 않는 문항입니다.');
    });

    it('클라이언트가 제출한 정답 개수가 서버 계산과 다를 때, BadRequestException을 던진다', async () => {
      const data = { ...submitGradingRequests.basic, correctCount: 999 }; // 잘못된 개수
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: mockExam.lectureId,
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ]);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          data,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow('정답 개수가 올바르지 않습니다');
    });

    it('수강 정보의 강의 ID와 시험의 강의 ID가 일치하지 않을 때, BadRequestException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue({
        id: 'le-1',
        lectureId: 'other-lecture',
      } as Awaited<
        ReturnType<typeof mockLectureEnrollmentsRepo.findByIdWithDetails>
      >);

      await expect(
        gradesService.submitGrading(
          mockExam.id,
          submitGradingRequests.basic,
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('[조회] getGradesByExam', () => {
    it('권한이 있는 사용자가 성적 조회를 요청할 때, 해당 시험의 성적 목록이 반환된다', async () => {
      const mockGradesList = [mockGrades.withEnrollment] as unknown as Awaited<
        ReturnType<typeof mockGradesRepo.findGradesByExamId>
      >;
      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockGradesRepo.findGradesByExamId.mockResolvedValue(mockGradesList);

      const result = await gradesService.getGradesByExam(
        mockExam.id,
        mockUserType,
        mockProfileId,
      );

      expect(mockGradesRepo.findGradesByExamId).toHaveBeenCalledWith(
        mockExam.id,
      );
      expect(result).toEqual(mockGradesList);
    });

    it('존재하지 않는 시험의 성적을 조회할 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        gradesService.getGradesByExam(mockExam.id, mockUserType, mockProfileId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[조회] getStudentGradeWithAnswers', () => {
    it('유효한 요청에 대해 성적 및 답안 정보를 반환한다', async () => {
      // Arrange
      const mockGradeWithDetails = {
        score: 90,
        isPass: true,
        exam: {
          title: '중간고사',
          questions: [
            {
              id: 'q1',
              examId: mockExam.id,
              lectureId: mockExam.lectureId,
              questionNumber: 1,
              type: 'MULTIPLE',
              score: 10,
              content: 'Q1 Content',
              correctAnswer: 'A',
              choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
              source: null,
              category: null,
            },
          ],
        },
        lectureEnrollment: {
          id: 'le-1',
          registeredAt: new Date(),
          memo: null,
          lectureId: mockExam.lectureId,
          enrollmentId: 'enrollment-1',
          enrollment: {
            id: 'enrollment-1',
            studentName: '홍길동',
            studentPhone: '010-1234-5678',
            school: '서울고등학교',
            schoolYear: '3',
          },
          studentAnswers: [
            {
              id: 'sa-1',
              lectureId: mockExam.lectureId,
              createdAt: new Date(),
              lectureEnrollmentId: 'le-1',
              questionId: 'q1',
              submittedAnswer: 'A',
              isCorrect: true,
            },
          ],
        },
      };

      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockGradesRepo.findGradeWithDetailsByExamAndEnrollment.mockResolvedValue(
        mockGradeWithDetails as unknown as Awaited<
          ReturnType<
            typeof mockGradesRepo.findGradeWithDetailsByExamAndEnrollment
          >
        >, // Cast to satisfy Prisma's complex nested type
      );

      // Act
      const result = await gradesService.getStudentGradeWithAnswers(
        mockExam.id,
        'le-1',
        mockUserType,
        mockProfileId,
      );

      // Assert
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(mockExam.id);
      expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
        mockExam.lectureId,
      );
      expect(mockPermissionService.validateInstructorAccess).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.studentName).toBe('홍길동');
      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].submittedAnswer).toBe('A');
      expect(result.questions[0].isCorrect).toBe(true);
    });

    it('성적 정보가 존재하지 않을 때, NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockGradesRepo.findGradeWithDetailsByExamAndEnrollment.mockResolvedValue(
        null,
      );

      await expect(
        gradesService.getStudentGradeWithAnswers(
          mockExam.id,
          'le-1',
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
