/**
 * 다른 서비스들은 Prisma.JsonNull과 같은 런타임 값을 사용하지 않기 때문에 TypeScript 컴파일러가 import를 제거(elide)합니다. 하지만
 * StatisticsService는 Prisma.JsonNull을 실제로 사용하므로 import가 유지하기 위해 전체 mock을 사용하여 유지
 */
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
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import {
  mockExams,
  mockExamSummary,
  mockQuestionStats,
  mockStudentGrades,
  mockCorrectCounts,
  mockQuestions,
} from '../test/fixtures/index.js';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { StatisticsRepository } from '../repos/statistics.repo.js';
import type { ExamsRepository } from '../repos/exams.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { PermissionService } from './permission.service.js';

describe('StatisticsService - @unit #critical', () => {
  let statisticsService: StatisticsService;
  let mockStatisticsRepo: jest.Mocked<StatisticsRepository>;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
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

  describe('[통계 산출 및 저장] calculateAndSaveStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('시험 통계를 산출할 때, 해당 시험에 대한 강사 권한이 없으면 ForbiddenException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      // Act & Assert
      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('시험 통계를 산출할 때, 시험 정보 자체가 존재하지 않으면 NotFoundException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험 통계를 산출할 때, 시험에 등록된 문항이 하나도 없으면 통계 산출을 건너뛰고 빈 배열을 반환한다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([]);

      // Act
      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      // Assert
      expect(result).toEqual([]);
      expect(mockStatisticsRepo.countGradesByExamId).not.toHaveBeenCalled();
    });

    it('시험 통계를 산출할 때, 문항별 정답률과 선택지 변별도를 계산하여 성공적으로 저장한다', async () => {
      // Arrange
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

      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
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

      // Act
      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      // Assert
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

  describe('[통계 정보 조회] getStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('통계 정보를 조회할 때, 해당 시험에 대한 강사 권한이 없으면 ForbiddenException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      // Act & Assert
      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('통계 정보를 조회할 때, 시험 정보 자체가 존재하지 않으면 NotFoundException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('통계 정보를 조회할 때, 시험 요약 정보와 학생별 성적 및 석차 정보를 산출하여 반환한다', async () => {
      // Arrange
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

      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
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

      // Act
      const result = await statisticsService.getStatistics(
        examId,
        userType,
        profileId,
      );

      // Assert
      expect(result.studentStats).toHaveLength(3);
      expect(result.studentStats[0].rank).toBe(1);
      expect(result.studentStats[1].rank).toBe(1); // 동점자 처리
      expect(result.studentStats[2].rank).toBe(3); // 3번째 학생은 3등
    });
  });
});
