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
  createMockGradesRepository,
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
import type { GradesRepository } from '../repos/grades.repo.js';
import type { PermissionService } from './permission.service.js';

describe('StatisticsService - @unit #critical', () => {
  let statisticsService: StatisticsService;
  let mockStatisticsRepo: jest.Mocked<StatisticsRepository>;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockGradesRepo: jest.Mocked<GradesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStatisticsRepo = createMockStatisticsRepository();
    mockExamsRepo = createMockExamsRepository();
    mockExamsRepo = createMockExamsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockGradesRepo = createMockGradesRepository();
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
      mockGradesRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[통계 산출 및 저장] calculateAndSaveStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('시험 통계를 산출할 때, 해당 시험에 대한 강사 권한이 없으면 ForbiddenException을 던진다', async () => {
      // 준비
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      // 실행 & Assert
      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('시험 통계를 산출할 때, 시험 정보 자체가 존재하지 않으면 NotFoundException을 던진다', async () => {
      // 준비
      mockExamsRepo.findById.mockResolvedValue(null);

      // 실행 & Assert
      await expect(
        statisticsService.calculateAndSaveStatistics(
          examId,
          userType,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험 통계를 산출할 때, 시험에 등록된 문항이 하나도 없으면 통계 산출을 건너뛰고 빈 배열을 반환한다', async () => {
      // 준비
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockExamsRepo.findQuestionsByExamId.mockResolvedValue([]);

      // 실행
      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      // 검증
      expect(result).toEqual([]);
      expect(mockStatisticsRepo.countGradesByExamId).not.toHaveBeenCalled();
    });

    it('시험 통계를 산출할 때, 문항별 정답률과 선택지 변별도를 계산하여 성공적으로 저장한다', async () => {
      // 준비
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

      mockGradesRepo.calculateAverageByExamId.mockResolvedValue(85.5);
      mockExamsRepo.updateStatistics.mockResolvedValue({
        ...mockExams.basic,
        averageScore: 85.5,
        gradesCount: 10,
      } as unknown as Awaited<
        ReturnType<typeof mockExamsRepo.updateStatistics>
      >);

      // getStatistics 호출을 위한 Mock 설정 (findById)
      mockExamsRepo.findById.mockResolvedValue({
        ...mockExams.basic,
        averageScore: 85.5,
        gradesCount: 10,
      } as unknown as Awaited<ReturnType<typeof mockExamsRepo.findById>>);
      const result = await statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      // 검증
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

      // 등수 계산 및 저장 검증
      expect(mockStatisticsRepo.updateGradeRank).toHaveBeenCalledTimes(
        mockStudentGrades.length,
      );
      expect(result).toBeDefined();

      // updateStatistics 호출 검증
      expect(mockGradesRepo.calculateAverageByExamId).toHaveBeenCalledWith(
        examId,
        expect.anything(),
      );
      expect(mockExamsRepo.updateStatistics).toHaveBeenCalledWith(
        examId,
        85.5,
        totalSubmissions,
        expect.anything(),
      );
    });
  });

  describe('[통계 정보 조회] getStatistics', () => {
    const examId = mockExams.basic.id;
    const userType = UserType.INSTRUCTOR;
    const profileId = 'instructor-1';

    it('통계 정보를 조회할 때, 해당 시험에 대한 강사 권한이 없으면 ForbiddenException을 던진다', async () => {
      // 준비
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      // 실행 & Assert
      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('통계 정보를 조회할 때, 시험 정보 자체가 존재하지 않으면 NotFoundException을 던진다', async () => {
      // 준비
      mockExamsRepo.findById.mockResolvedValue(null);

      // 실행 & Assert
      await expect(
        statisticsService.getStatistics(examId, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('통계 정보를 조회할 때, 저장된 등수 정보를 사용하여 반환한다', async () => {
      // 준비
      // 저장된 rank가 있는 데이터 준비
      const studentGrades = [
        {
          id: 'g-1',
          lectureEnrollmentId: 'le-1',
          score: 100,
          rank: 1, // 저장된 1등
          lectureEnrollment: {
            enrollment: { id: 'e-1', studentName: 'S1', school: 'A' },
          },
        },
        {
          id: 'g-2',
          lectureEnrollmentId: 'le-2',
          score: 100,
          rank: 10, // 점수는 같지만 저장된 등수가 10등이라면 그대로 10등 반환해야 함 (실시간 계산 아님을 증명)
          lectureEnrollment: {
            enrollment: { id: 'e-2', studentName: 'S2', school: 'B' },
          },
        },
        {
          id: 'g-3',
          lectureEnrollmentId: 'le-3',
          score: 90,
          rank: 3,
          lectureEnrollment: {
            enrollment: { id: 'e-3', studentName: 'S3', school: 'C' },
          },
        },
      ];
      const correctCounts = { 'le-1': 10, 'le-2': 10, 'le-3': 9 };

      mockExamsRepo.findById.mockResolvedValue({
        ...mockExams.basic,
        averageScore: 88.5,
        gradesCount: 3,
      } as unknown as Awaited<ReturnType<typeof mockExamsRepo.findById>>);

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

      // 실행
      const result = await statisticsService.getStatistics(
        examId,
        userType,
        profileId,
      );

      // 검증
      expect(result.studentStats).toHaveLength(3);
      expect(result.studentStats[0].rank).toBe(1);
      expect(result.studentStats[1].rank).toBe(10); // 저장된 등수 사용 확인
      expect(result.studentStats[2].rank).toBe(3);

      expect(result.examStats.averageScore).toBe(88.5);
      expect(result.examStats.totalExaminees).toBe(3);
    });
  });
});
