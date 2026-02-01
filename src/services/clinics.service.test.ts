import { ClinicsService } from './clinics.service.js';
import { UserType } from '../constants/auth.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '../err/http.exception.js';
import {
  createMockClinicsRepository,
  createMockExamsRepository,
  createMockLecturesRepository,
  createMockPermissionService,
  createMockPrisma,
} from '../test/mocks/index.js';
import {
  mockExams,
  mockLectures,
  mockEnrollments,
  mockGrades,
  mockClinics,
  mockClinicWithRelations,
} from '../test/fixtures/index.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

describe('ClinicsService - @unit #critical', () => {
  let clinicsService: ClinicsService;
  let mockClinicsRepo: ReturnType<typeof createMockClinicsRepository>;
  let mockExamsRepo: ReturnType<typeof createMockExamsRepository>;
  let mockLecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockClinicsRepo = createMockClinicsRepository();
    mockExamsRepo = createMockExamsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;

    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        callback(mockPrisma),
    );

    clinicsService = new ClinicsService(
      mockClinicsRepo,
      mockExamsRepo,
      mockLecturesRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('completeGrading', () => {
    const examId = mockExams.basic.id;
    const profileId = mockLectures.basic.instructorId;
    const userType = UserType.INSTRUCTOR;
    const createData = {
      title: '클리닉 테스트',
      deadline: '2024-12-31',
      memo: '테스트 메모',
    };

    it('시험을 찾을 수 없는 경우 NotFoundException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        clinicsService.completeGrading(examId, createData, userType, profileId),
      ).rejects.toThrow(NotFoundException);
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(examId);
    });

    it('강의를 찾을 수 없는 경우 NotFoundException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue(mockExams.basic);
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        clinicsService.completeGrading(examId, createData, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('시험의 채점 상태가 IN_PROGRESS가 아닌 경우 BadRequestException을 던진다', async () => {
      mockExamsRepo.findById.mockResolvedValue({
        ...mockExams.basic,
        gradingStatus: GradingStatus.PENDING,
      });
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);

      await expect(
        clinicsService.completeGrading(examId, createData, userType, profileId),
      ).rejects.toThrow(BadRequestException);
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(examId);
    });

    it('불합격자들에 대해 클리닉을 생성하고 시험 상태를 COMPLETED로 변경한다', async () => {
      const mockExam = {
        ...mockExams.basic,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      const mockLecture = mockLectures.basic;
      const failedGrades = [
        {
          ...mockGrades.exam1_student1,
          enrollmentId: 'enroll-1',
          isPass: false,
        },
        {
          ...mockGrades.exam1_student1,
          enrollmentId: 'enroll-2',
          isPass: false,
        },
      ];

      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLecture);
      mockClinicsRepo.findFailedGradesByExamId.mockResolvedValue(
        failedGrades as Awaited<
          ReturnType<typeof mockClinicsRepo.findFailedGradesByExamId>
        >,
      );
      mockClinicsRepo.findExistingClinics.mockResolvedValue([]);
      mockClinicsRepo.createMany.mockResolvedValue({ count: 2 });

      const result = await clinicsService.completeGrading(
        examId,
        createData,
        userType,
        profileId,
      );

      expect(result.count).toBe(2);
      expect(mockClinicsRepo.createMany).toHaveBeenCalled();
      expect(mockExamsRepo.updateGradingStatus).toHaveBeenCalledWith(
        examId,
        GradingStatus.COMPLETED,
        expect.anything(),
      );
    });

    it('이미 클리닉이 생성된 학생은 제외하고 생성한다', async () => {
      const mockExam = {
        ...mockExams.basic,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      const failedGrades = [
        {
          ...mockGrades.exam1_student1,
          enrollmentId: 'enroll-1',
          isPass: false,
        },
        {
          ...mockGrades.exam1_student1,
          enrollmentId: 'enroll-2',
          isPass: false,
        },
      ];
      const existingClinics = [{ enrollmentId: 'enroll-1' }];

      mockExamsRepo.findById.mockResolvedValue(mockExam);
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockClinicsRepo.findFailedGradesByExamId.mockResolvedValue(
        failedGrades as Awaited<
          ReturnType<typeof mockClinicsRepo.findFailedGradesByExamId>
        >,
      );
      mockClinicsRepo.findExistingClinics.mockResolvedValue(existingClinics);
      mockClinicsRepo.createMany.mockResolvedValue({ count: 1 });

      const result = await clinicsService.completeGrading(
        examId,
        createData,
        userType,
        profileId,
      );

      expect(result.count).toBe(1);
      // enroll-1은 이미 존재하므로 enroll-2만 생성 요청되어야 함
      const callArgs = mockClinicsRepo.createMany.mock.calls[0][0];
      expect(callArgs).toHaveLength(1);
      expect(callArgs[0].enrollmentId).toBe('enroll-2');
    });
  });

  describe('getClinics', () => {
    const profileId = mockLectures.basic.instructorId;

    it('강사 계정으로 조회 시 본인의 클리닉 목록을 반환하고 성적 정보를 포함한다', async () => {
      const clinicsWithRelations = [mockClinicWithRelations];

      mockClinicsRepo.findByInstructor.mockResolvedValue(
        clinicsWithRelations as Awaited<
          ReturnType<typeof mockClinicsRepo.findByInstructor>
        >,
      );
      (mockPrisma.grade.findMany as jest.Mock).mockResolvedValue([
        {
          examId: mockExams.basic.id,
          enrollmentId: mockEnrollments.active.id,
          score: 70,
        },
      ]);

      const result = await clinicsService.getClinics(
        UserType.INSTRUCTOR,
        profileId,
        {},
      );

      expect(result).toHaveLength(1);
      expect(result[0].exam.score).toBe(70);
      expect(mockClinicsRepo.findByInstructor).toHaveBeenCalledWith(
        profileId,
        {},
      );
    });

    it('조교 계정으로 조회 시 담당 강사의 ID를 기반으로 목록을 조회한다', async () => {
      const assistantProfileId = 'assistant-1';
      const instructorId = mockLectures.basic.instructorId;

      (mockPrisma.assistant.findUnique as jest.Mock).mockResolvedValue({
        instructorId,
      });
      mockClinicsRepo.findByInstructor.mockResolvedValue([]);

      await clinicsService.getClinics(
        UserType.ASSISTANT,
        assistantProfileId,
        {},
      );

      expect(mockClinicsRepo.findByInstructor).toHaveBeenCalledWith(
        instructorId,
        {},
      );
    });

    it('권한이 없는 사용자 유형일 경우 BadRequestException을 던진다', async () => {
      await expect(
        clinicsService.getClinics(UserType.STUDENT, 'student-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateClinics', () => {
    const profileId = mockLectures.basic.instructorId;
    const clinicIds = [mockClinics.pending.id, mockClinics.completed.id];
    const updateData = {
      clinicIds,
      updates: {
        status: 'COMPLETED' as const,
        memo: '업데이트 메모',
      },
    };

    it('일부 클리닉 ID를 찾을 수 없는 경우 NotFoundException을 던진다', async () => {
      mockClinicsRepo.findByIds.mockResolvedValue([mockClinics.pending]);

      await expect(
        clinicsService.updateClinics(
          updateData,
          UserType.INSTRUCTOR,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('강사의 권한이 없는 클리닉인 경우 ForbiddenException을 던진다', async () => {
      const otherClinics = [
        { ...mockClinics.pending, instructorId: 'other-instructor' },
        { ...mockClinics.completed, instructorId: 'other-instructor' },
      ];
      mockClinicsRepo.findByIds.mockResolvedValue(otherClinics);
      mockLecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        instructorId: 'other-instructor',
      });
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        clinicsService.updateClinics(
          updateData,
          UserType.INSTRUCTOR,
          profileId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('클리닉들을 성공적으로 수정한다', async () => {
      const myClinics = [mockClinics.pending, mockClinics.completed];
      mockClinicsRepo.findByIds.mockResolvedValue(myClinics);
      mockClinicsRepo.updateMany.mockResolvedValue({ count: 2 });

      const result = await clinicsService.updateClinics(
        updateData,
        UserType.INSTRUCTOR,
        profileId,
      );

      expect(result.count).toBe(2);
      expect(mockClinicsRepo.updateMany).toHaveBeenCalledWith(
        clinicIds,
        expect.objectContaining({ status: 'COMPLETED', memo: '업데이트 메모' }),
        expect.anything(),
      );
    });
  });
});
