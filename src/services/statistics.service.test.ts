jest.mock('../generated/prisma/client.js', () => ({
  PrismaClient: jest.fn(),
  Prisma: {
    JsonNull: 'JsonNull',
    TransactionClient: jest.fn(),
  },
}));

import { StatisticsService } from './statistics.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';
import {
  createMockStatisticsRepository,
  createMockExamsRepository,
  createMockLecturesRepository,
  createMockPermissionService,
  createMockPrisma,
} from '../test/mocks/index.js';
import {
  mockExams,
  mockExamSummary,
  mockQuestionStats,
  mockStudentGrades,
  mockCorrectCounts,
  mockQuestions,
} from '../test/fixtures/index.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('StatisticsService - @unit #critical', () => {
  let statisticsService: StatisticsService;
  let mockStatisticsRepo: ReturnType<typeof createMockStatisticsRepository>;
  let mockExamsRepo: ReturnType<typeof createMockExamsRepository>;
  let mockLecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStatisticsRepo = createMockStatisticsRepository();
    mockExamsRepo = createMockExamsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    statisticsService = new StatisticsService(
      mockStatisticsRepo,
      mockExamsRepo,
      mockLecturesRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('calculateAndSaveStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('강사의 권한이 없는 시험인 경우 ForbiddenException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('시험을 찾을 수 없는 경우 NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('문항이 없는 경우 빈 배열을 반환한다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([]);

      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      expect(result).toEqual([]);
      expect(mockStatisticsRepo.countGradesByExamId).not.toHaveBeenCalled();
    });

    it('정상적으로 통계를 산출하고 저장한다', async () => {
      const questions = [
        mockQuestions.multipleChoice,
        mockQuestions.shortAnswer,
      ];
      const totalSubmissions = 10;
      const answersQ1 = [
        { isCorrect: true, submittedAnswer: 'A' },
        { isCorrect: true, submittedAnswer: 'A' },
        { isCorrect: false, submittedAnswer: 'B' },
      ]; // 2/10 = 20%
      const answersQ2 = [
        { isCorrect: true, submittedAnswer: 'Ans' },
        { isCorrect: false, submittedAnswer: 'Wrong' },
      ]; // 1/10 = 10%

      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue(
        questions as Awaited<
          ReturnType<typeof mockExamsRepo.findQuestionsByExamId>
        >,
      );
      mockStatisticsRepo.countGradesByExamId.mockResolvedValue(
        totalSubmissions,
      );

      mockStatisticsRepo.findStudentAnswersByQuestionId
        .mockResolvedValueOnce(
          answersQ1 as Awaited<
            ReturnType<typeof mockStatisticsRepo.findStudentAnswersByQuestionId>
          >,
        )
        .mockResolvedValueOnce(
          answersQ2 as Awaited<
            ReturnType<typeof mockStatisticsRepo.findStudentAnswersByQuestionId>
          >,
        );

      // getStatistics 호출을 위한 Mock 설정
      mockStatisticsRepo.getExamSummary.mockResolvedValue(
        mockExamSummary as Awaited<
          ReturnType<typeof mockStatisticsRepo.getExamSummary>
        >,
      );
      mockStatisticsRepo.findStatisticsByExamId.mockResolvedValue([
        mockQuestionStats.q1,
        mockQuestionStats.q2,
      ] as Awaited<
        ReturnType<typeof mockStatisticsRepo.findStatisticsByExamId>
      >);
      mockStatisticsRepo.getStudentGradesWithInfo.mockResolvedValue(
        mockStudentGrades as Awaited<
          ReturnType<typeof mockStatisticsRepo.getStudentGradesWithInfo>
        >,
      );
      mockStatisticsRepo.getStudentCorrectCounts.mockResolvedValue(
        mockCorrectCounts,
      );

      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      expect(mockStatisticsRepo.upsertQuestionStatistic).toHaveBeenCalledTimes(
        2,
      );
      expect(mockStatisticsRepo.upsertQuestionStatistic).toHaveBeenCalledWith(
        examId,
        mockQuestions.multipleChoice.id,
        expect.objectContaining({
          totalSubmissions,
          correctRate: 20,
          choiceRates: expect.objectContaining({ A: 20, B: 10 }),
        }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });

  describe('getStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('강사의 권한이 없는 시험인 경우 ForbiddenException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('시험을 찾을 수 없는 경우 NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(null);

      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('정상적으로 통계 정보를 반환하고 석차를 계산한다', async () => {
      const studentGrades = [
        {
          enrollmentId: 'e1',
          score: 100,
          enrollment: { studentName: 'S1', school: 'A' },
        },
        {
          enrollmentId: 'e2',
          score: 100,
          enrollment: { studentName: 'S2', school: 'B' },
        }, // 동점
        {
          enrollmentId: 'e3',
          score: 90,
          enrollment: { studentName: 'S3', school: 'C' },
        }, // 3등
      ];
      const correctCounts = { e1: 10, e2: 10, e3: 9 };
      const summary = { ...mockExamSummary, totalExaminees: 3 };

      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockStatisticsRepo.getExamSummary.mockResolvedValue(
        summary as Awaited<
          ReturnType<typeof mockStatisticsRepo.getExamSummary>
        >,
      );
      mockStatisticsRepo.findStatisticsByExamId.mockResolvedValue([
        mockQuestionStats.q1,
      ] as Awaited<
        ReturnType<typeof mockStatisticsRepo.findStatisticsByExamId>
      >);
      mockStatisticsRepo.getStudentGradesWithInfo.mockResolvedValue(
        studentGrades as Awaited<
          ReturnType<typeof mockStatisticsRepo.getStudentGradesWithInfo>
        >,
      );
      mockStatisticsRepo.getStudentCorrectCounts.mockResolvedValue(
        correctCounts,
      );
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([
        mockQuestions.multipleChoice,
      ] as Awaited<ReturnType<typeof mockExamsRepo.findQuestionsByExamId>>);

      const result = await statisticsService.getStatistics(
        examId,
        userType,
        profileId,
      );

      expect(result.studentStats).toHaveLength(3);
      expect(result.studentStats[0].rank).toBe(1);
      expect(result.studentStats[1].rank).toBe(1); // 동점자 처리
      expect(result.studentStats[2].rank).toBe(3); // 3번째 학생은 3등
    });
  });
});
