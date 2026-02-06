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
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import {
  mockExams,
  mockLectures,
  mockClinics,
  mockClinicWithRelations,
  createClinicDto,
} from '../test/fixtures/index.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { ClinicsRepository } from '../repos/clinics.repo.js';
import type { ExamsRepository } from '../repos/exams.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { PermissionService } from './permission.service.js';

describe('ClinicsService - @unit #critical', () => {
  let clinicsService: ClinicsService;
  let mockClinicsRepo: jest.Mocked<ClinicsRepository>;
  let mockExamsRepo: jest.Mocked<ExamsRepository>;
  let mockLecturesRepo: jest.Mocked<LecturesRepository>;
  let mockPermissionService: jest.Mocked<PermissionService>;
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
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    clinicsService = new ClinicsService(
      mockClinicsRepo,
      mockExamsRepo,
      mockLecturesRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[채점 완료] completeGrading', () => {
    const examId = mockExams.basic.id;
    const profileId = mockLectures.basic.instructorId;
    const userType = UserType.INSTRUCTOR;
    const createData = createClinicDto;

    it('클리닉 생성을 완료할 때, 시험 정보를 찾을 수 없으면 NotFoundException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        clinicsService.completeGrading(examId, createData, userType, profileId),
      ).rejects.toThrow(NotFoundException);
      expect(mockExamsRepo.findById).toHaveBeenCalledWith(examId);
    });

    it('클리닉 생성을 완료할 때, 강의 정보를 찾을 수 없으면 NotFoundException을 던진다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue(
        mockExams.basic as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        clinicsService.completeGrading(examId, createData, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('클리닉 생성을 완료할 때, 시험의 채점 상태가 진행 중(IN_PROGRESS)이 아니더라도(예: PENDING) 성공적으로 완료 처리하고 상태를 변경한다', async () => {
      // Arrange
      mockExamsRepo.findById.mockResolvedValue({
        ...mockExams.basic,
        gradingStatus: GradingStatus.PENDING,
        isAutoClinic: true,
      } as Awaited<ReturnType<typeof mockExamsRepo.findById>>);
      mockLecturesRepo.findById.mockResolvedValue(
        mockLectures.basic as Awaited<
          ReturnType<typeof mockLecturesRepo.findById>
        >,
      );
      mockClinicsRepo.findFailedGradesByExamId.mockResolvedValue([]);
      mockClinicsRepo.findExistingClinics.mockResolvedValue([]);

      // Act
      const result = await clinicsService.completeGrading(
        examId,
        createData,
        userType,
        profileId,
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockExamsRepo.updateGradingStatus).toHaveBeenCalledWith(
        examId,
        GradingStatus.COMPLETED,
      );
    });

    it('클리닉 생성을 완료할 때, 불합격한 학생들에 대해 클리닉을 생성하고 시험 상태를 완료(COMPLETED)로 변경한다', async () => {
      // Arrange
      const mockExam = {
        ...mockExams.basic,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      const mockLecture = mockLectures.basic;
      const failedGrades = [
        {
          id: 'grade-1',
          lectureId: mockExam.lectureId,
          examId: mockExam.id,
          lectureEnrollmentId: 'le-1',
          lectureEnrollment: {
            id: 'le-1',
            lectureId: mockExam.lectureId,
            registeredAt: new Date(),
            enrollmentId: 'enroll-1',
            enrollment: {
              id: 'enroll-1',
              studentName: '학생1',
              studentPhone: '010-1234-5678',
              school: '테스트고',
              schoolYear: 'HIGH1',
            },
          },
          score: 50,
          isPass: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'grade-2',
          lectureId: mockExam.lectureId,
          examId: mockExam.id,
          lectureEnrollmentId: 'le-2',
          lectureEnrollment: {
            id: 'le-2',
            lectureId: mockExam.lectureId,
            registeredAt: new Date(),
            enrollmentId: 'enroll-2',
            enrollment: {
              id: 'enroll-2',
              studentName: '학생2',
              studentPhone: '010-8765-4321',
              school: '테스트고',
              schoolYear: 'HIGH1',
            },
          },
          score: 40,
          isPass: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLecture as Awaited<ReturnType<typeof mockLecturesRepo.findById>>,
      );
      mockClinicsRepo.findFailedGradesByExamId.mockResolvedValue(
        failedGrades as Awaited<
          ReturnType<typeof mockClinicsRepo.findFailedGradesByExamId>
        >,
      );
      mockClinicsRepo.findExistingClinics.mockResolvedValue([]);
      mockClinicsRepo.createMany.mockResolvedValue({ count: 2 });

      // Act
      const result = await clinicsService.completeGrading(
        examId,
        createData,
        userType,
        profileId,
      );

      // Assert
      expect(result.createCount).toBe(2);
      expect(mockClinicsRepo.createMany).toHaveBeenCalled();
      expect(mockExamsRepo.updateGradingStatus).toHaveBeenCalledWith(
        examId,
        GradingStatus.COMPLETED,
        expect.anything(),
      );
    });

    it('클리닉 생성을 완료할 때, 이미 클리닉이 생성된 학생은 제외하고 나머지 학생들에 대해서만 생성한다', async () => {
      // Arrange
      const mockExam = {
        ...mockExams.basic,
        gradingStatus: GradingStatus.IN_PROGRESS,
      };
      const failedGrades = [
        {
          id: 'grade-1',
          lectureId: mockExam.lectureId,
          examId: mockExam.id,
          lectureEnrollmentId: 'le-1',
          lectureEnrollment: {
            id: 'le-1',
            lectureId: mockExam.lectureId,
            registeredAt: new Date(),
            enrollmentId: 'enroll-1',
            enrollment: {
              id: 'enroll-1',
              studentName: '학생1',
              studentPhone: '010-1234-5678',
              school: '테스트고',
              schoolYear: 'HIGH1',
            },
          },
          score: 50,
          isPass: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'grade-2',
          lectureId: mockExam.lectureId,
          examId: mockExam.id,
          lectureEnrollmentId: 'le-2',
          lectureEnrollment: {
            id: 'le-2',
            lectureId: mockExam.lectureId,
            registeredAt: new Date(),
            enrollmentId: 'enroll-2',
            enrollment: {
              id: 'enroll-2',
              studentName: '학생2',
              studentPhone: '010-8765-4321',
              school: '테스트고',
              schoolYear: 'HIGH1',
            },
          },
          score: 40,
          isPass: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      const existingClinics = [{ lectureEnrollmentId: 'le-1' }];

      mockExamsRepo.findById.mockResolvedValue(
        mockExam as Awaited<ReturnType<typeof mockExamsRepo.findById>>,
      );
      mockLecturesRepo.findById.mockResolvedValue(
        mockLectures.basic as Awaited<
          ReturnType<typeof mockLecturesRepo.findById>
        >,
      );
      mockClinicsRepo.findFailedGradesByExamId.mockResolvedValue(
        failedGrades as Awaited<
          ReturnType<typeof mockClinicsRepo.findFailedGradesByExamId>
        >,
      );
      mockClinicsRepo.findExistingClinics.mockResolvedValue(
        existingClinics as Awaited<
          ReturnType<typeof mockClinicsRepo.findExistingClinics>
        >,
      );
      mockClinicsRepo.createMany.mockResolvedValue({ count: 1 });

      // Act
      const result = await clinicsService.completeGrading(
        examId,
        createData,
        userType,
        profileId,
      );

      // Assert
      expect(result.createCount).toBe(1);
      // enroll-1은 이미 존재하므로 enroll-2만 생성 요청되어야 함
      const callArgs = mockClinicsRepo.createMany.mock.calls[0][0];
      expect(callArgs).toHaveLength(1);
      expect(callArgs[0].lectureEnrollmentId).toBe('le-2');
    });
  });

  describe('[목록 조회] getClinics', () => {
    const profileId = mockLectures.basic.instructorId;

    it('클리닉 목록을 조회할 때, 강사 계정인 경우 본인의 클리닉 목록과 성적 정보를 함께 반환한다', async () => {
      // Arrange
      const clinicsWithRelations = [mockClinicWithRelations].map((c) => ({
        ...c,
        lectureEnrollment: {
          enrollment: c.lectureEnrollment.enrollment,
        },
      }));

      mockClinicsRepo.findByInstructor.mockResolvedValue(
        clinicsWithRelations as Awaited<
          ReturnType<typeof mockClinicsRepo.findByInstructor>
        >,
      );
      (mockPrisma.grade.findMany as jest.Mock).mockResolvedValue([
        {
          examId: mockExams.basic.id,
          lectureEnrollmentId: mockClinicWithRelations.lectureEnrollmentId,
          score: 70,
        },
      ]);

      // Act
      const result = await clinicsService.getClinics(
        UserType.INSTRUCTOR,
        profileId,
        {},
      );

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].exam.score).toBe(70);
      expect(result[0].lecture.title).toBe(mockLectures.basic.title);
      expect(result[0].student.parentPhone).toBe(
        mockClinicWithRelations.lectureEnrollment.enrollment.parentPhone,
      );
      expect(mockClinicsRepo.findByInstructor).toHaveBeenCalledWith(
        profileId,
        {},
      );
    });

    it('클리닉 목록을 조회할 때, 조교 계정인 경우 담당 강사의 클리닉 목록을 조회하여 반환한다', async () => {
      // Arrange
      const assistantProfileId = 'assistant-id';
      const instructorId = mockLectures.basic.instructorId;

      (mockPrisma.assistant.findUnique as jest.Mock).mockResolvedValue({
        instructorId,
      });
      mockClinicsRepo.findByInstructor.mockResolvedValue([]);

      // Act
      await clinicsService.getClinics(
        UserType.ASSISTANT,
        assistantProfileId,
        {},
      );

      // Assert
      expect(mockClinicsRepo.findByInstructor).toHaveBeenCalledWith(
        instructorId,
        {},
      );
    });

    it('클리닉 목록을 조회할 때, 권한이 없는 사용자 유형(예: 학생)이면 BadRequestException을 던진다', async () => {
      // Act & Assert
      await expect(
        clinicsService.getClinics(UserType.STUDENT, 'student-id', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('[정보 수정] updateClinics', () => {
    const profileId = mockLectures.basic.instructorId;
    const clinicIds = [mockClinics.pending.id, mockClinics.completed.id];
    const updateData = {
      clinicIds,
      updates: {
        status: 'COMPLETED' as const,
        memo: '업데이트 메모',
      },
    };

    it('클리닉 정보를 수정할 때, 요청된 ID 중 일부를 찾을 수 없으면 NotFoundException을 던진다', async () => {
      // Arrange
      mockClinicsRepo.findByIds.mockResolvedValue([
        mockClinics.pending as Awaited<
          ReturnType<typeof mockClinicsRepo.findByIds>
        >[number],
      ]);

      // Act & Assert
      await expect(
        clinicsService.updateClinics(
          updateData,
          UserType.INSTRUCTOR,
          profileId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('클리닉 정보를 수정할 때, 강사에게 권한이 없는 클리닉이 포함되어 있으면 ForbiddenException을 던진다', async () => {
      // Arrange
      const otherClinics = [
        { ...mockClinics.pending, instructorId: 'other-instructor' },
        { ...mockClinics.completed, instructorId: 'other-instructor' },
      ];
      mockClinicsRepo.findByIds.mockResolvedValue(
        otherClinics as Awaited<ReturnType<typeof mockClinicsRepo.findByIds>>,
      );
      mockLecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        instructorId: 'other-instructor',
      } as Awaited<ReturnType<typeof mockLecturesRepo.findById>>);
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      // Act & Assert
      await expect(
        clinicsService.updateClinics(
          updateData,
          UserType.INSTRUCTOR,
          profileId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('클리닉 정보를 수정할 때, 모든 조건이 유효하면 클리닉 상태와 메모를 성공적으로 업데이트한다', async () => {
      // Arrange
      const myClinics = [mockClinics.pending, mockClinics.completed];
      mockClinicsRepo.findByIds.mockResolvedValue(
        myClinics as Awaited<ReturnType<typeof mockClinicsRepo.findByIds>>,
      );
      mockClinicsRepo.updateMany.mockResolvedValue({ count: 2 });

      // Act
      const result = await clinicsService.updateClinics(
        updateData,
        UserType.INSTRUCTOR,
        profileId,
      );

      // Assert
      expect(result.count).toBe(2);
      expect(mockClinicsRepo.updateMany).toHaveBeenCalledWith(
        clinicIds,
        expect.objectContaining({ status: 'COMPLETED', memo: '업데이트 메모' }),
        expect.anything(),
      );
    });
  });
});
