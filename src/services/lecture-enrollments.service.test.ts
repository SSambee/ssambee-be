import { UserType } from '../constants/auth.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { LectureEnrollmentsService } from './lecture-enrollments.service.js';
import {
  createMockLectureEnrollmentsRepository,
  createMockGradesRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import { mockInstructor } from '../test/fixtures/index.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { GradesRepository } from '../repos/grades.repo.js';
import type { StatisticsRepository } from '../repos/statistics.repo.js';
import type { PermissionService } from './permission.service.js';
import type { PrismaClient } from '../generated/prisma/client.js';

describe('LectureEnrollmentsService - @unit', () => {
  let service: LectureEnrollmentsService;
  let mockLectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let mockGradesRepo: jest.Mocked<GradesRepository>;
  let mockStatisticsRepo: jest.Mocked<StatisticsRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  const mockUserType = UserType.INSTRUCTOR;
  const mockProfileId = mockInstructor.id;
  const mockLectureEnrollmentId = 'le_123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockGradesRepo = createMockGradesRepository();
    // StatisticsRepository Mock 생성 함수가 없다면 직접 생성하거나 추가 필요
    // 여기서는 createMockGradesRepository처럼 직접 캐스팅해서 생성
    mockStatisticsRepo = {
      upsertQuestionStatistic: jest.fn(),
      findStatisticsByExamId: jest.fn(),
      countGradesByExamId: jest.fn(),
      findStudentAnswersByQuestionId: jest.fn(),
      getExamSummary: jest.fn(),
      getStudentCorrectCounts: jest.fn(),
      getStudentGradesWithInfo: jest.fn(),
      updateGradeRank: jest.fn(),
    } as unknown as jest.Mocked<StatisticsRepository>;

    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    service = new LectureEnrollmentsService(
      mockLectureEnrollmentsRepo,
      mockGradesRepo,
      mockStatisticsRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('getLectureEnrollmentDetail', () => {
    it('유효한 ID로 조회 시 상세 정부와 성적 목록을 반환한다', async () => {
      // Arrange
      const mockResult = {
        id: mockLectureEnrollmentId,
        lecture: {
          title: '강의 제목',
          instructorId: 'instr_1',
          schoolYear: '3',
          subject: 'MATH',
          instructor: {
            user: { name: '강사명' },
          },
        },
        enrollment: {
          studentName: '학생명',
          school: '학교명',
          status: 'ACTIVE',
        },
        grades: [
          {
            examId: 'exam_1',
            score: 90,
            rank: 5,
            exam: {
              title: '시험 1',
              examDate: new Date(),
              subject: 'MATH',
            },
          },
        ],
      };

      mockLectureEnrollmentsRepo.findByIdWithGrades.mockResolvedValue(
        mockResult as unknown as Awaited<
          ReturnType<LectureEnrollmentsRepository['findByIdWithGrades']>
        >,
      );
      mockGradesRepo.calculateAverageByExamId.mockResolvedValue(85.5);
      mockStatisticsRepo.countGradesByExamId.mockResolvedValue(30);

      // Act
      const result = await service.getLectureEnrollmentDetail(
        mockLectureEnrollmentId,
        mockUserType,
        mockProfileId,
      );

      // Assert
      expect(
        mockLectureEnrollmentsRepo.findByIdWithGrades,
      ).toHaveBeenCalledWith(mockLectureEnrollmentId);
      expect(
        mockPermissionService.validateInstructorAccess,
      ).toHaveBeenCalledWith('instr_1', mockUserType, mockProfileId);
      expect(mockGradesRepo.calculateAverageByExamId).toHaveBeenCalledWith(
        'exam_1',
      );
      expect(mockStatisticsRepo.countGradesByExamId).toHaveBeenCalledWith(
        'exam_1',
      );

      expect(result.lecture.title).toBe('강의 제목');
      expect(result.grades[0].exam.average).toBe(85.5);
      expect(result.grades[0].exam.totalExaminees).toBe(30);
    });

    it('존재하지 않는 ID 조회 시 NotFoundException을 던진다', async () => {
      mockLectureEnrollmentsRepo.findByIdWithGrades.mockResolvedValue(null);

      await expect(
        service.getLectureEnrollmentDetail(
          'invalid_id',
          mockUserType,
          mockProfileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
