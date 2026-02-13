import { AttendancesService } from './attendances.service.js';
import { NotFoundException } from '../err/http.exception.js';
import {
  createMockAttendancesRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
  createMockAssistantRepository,
  createMockParentsService,
  createMockPermissionService,
  createMockPrisma,
} from '../test/mocks/index.js';
import {
  mockAttendances,
  mockEnrollments,
  mockLectures,
  mockInstructor,
  createAttendanceRequests,
  mockAttendanceLectureEnrollment,
} from '../test/fixtures/index.js';
import { AttendanceStatus } from '../constants/attendances.constant.js';
import { CreateBulkAttendancesDto } from '../validations/attendances.validation.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('AttendancesService - @unit #critical', () => {
  // Mock Dependencies
  let mockAttendancesRepo: ReturnType<typeof createMockAttendancesRepository>;
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockAttendanceLectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let mockLecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let mockAssistantRepo: ReturnType<typeof createMockAssistantRepository>;
  let mockParentsService: ReturnType<typeof createMockParentsService>;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: PrismaClient;

  // Service under test
  let attendancesService: AttendancesService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockAttendancesRepo = createMockAttendancesRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockAttendanceLectureEnrollmentsRepo =
      createMockLectureEnrollmentsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockAssistantRepo = createMockAssistantRepository();
    mockParentsService = createMockParentsService();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;

    // Create AttendancesService DI
    attendancesService = new AttendancesService(
      mockAttendancesRepo,
      mockEnrollmentsRepo,
      mockAttendanceLectureEnrollmentsRepo,
      mockLecturesRepo,
      mockAssistantRepo,
      mockParentsService,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[단체 출결 등록] createBulkAttendances', () => {
    const lectureId = mockLectures.basic.id;
    const instructorId = mockInstructor.id;
    const enrollmentId = mockEnrollments.active.id;

    const mockCreateBulkData: CreateBulkAttendancesDto = {
      date: new Date('2024-03-01'),
      attendances: [
        {
          enrollmentId: enrollmentId,
          status: AttendanceStatus.PRESENT,
          enterTime: new Date('2024-03-01T14:00:00.000Z'),
          leaveTime: new Date('2024-03-01T16:00:00.000Z'),
        },
        {
          enrollmentId: 'enrollment-id-2',
          status: AttendanceStatus.ABSENT,
          memo: '결석 사유',
        },
      ],
    };

    describe('ATT-01: 단체 출결 등록 성공', () => {
      it('강사가 자신의 강의에 대해 여러 명의 출결 정보를 한 번에 등록하거나 수정할 수 있다', async () => {
        // Arrange
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();

        // Mock LectureEnrollments (Enrollment 정보 포함)
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments.mockResolvedValue(
          [
            {
              ...mockAttendanceLectureEnrollment,
              enrollmentId: enrollmentId,
            } as unknown as Prisma.LectureEnrollmentGetPayload<{
              include: { enrollment: true };
            }>,
            {
              ...mockAttendanceLectureEnrollment,
              id: 'lecture-enrollment-id-2',
              enrollmentId: 'enrollment-id-2',
            } as unknown as Prisma.LectureEnrollmentGetPayload<{
              include: { enrollment: true };
            }>,
          ],
        );

        mockAttendancesRepo.upsert.mockResolvedValue(mockAttendances.present);

        // Mock $transaction
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
          fn(mockPrisma),
        );

        // 수정: bulkAttendanceRequests의 enrollmentId를 mockData에 맞게 조정
        const requests = [
          {
            enrollmentId: enrollmentId,
            status: AttendanceStatus.PRESENT,
          },
          {
            enrollmentId: 'enrollment-id-2',
            status: AttendanceStatus.ABSENT,
          },
        ];

        // Act
        const result = await attendancesService.createBulkAttendances(
          lectureId,
          { ...mockCreateBulkData, attendances: requests },
          UserType.INSTRUCTOR,
          instructorId,
        );

        // Assert
        expect(result).toHaveLength(2);
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(lectureId);
        expect(
          mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments,
        ).toHaveBeenCalledWith(lectureId);
        expect(mockAttendancesRepo.upsert).toHaveBeenCalledTimes(2);
      });
    });

    describe('ATT-02: 단체 출결 등록 실패', () => {
      it('존재하지 않는 강의 ID로 단체 출결 등록을 요청하면 NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          attendancesService.createBulkAttendances(
            'invalid-lecture-id',
            mockCreateBulkData,
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('해당 강의의 수강생이 아닌 enrollmentId로 출결 등록을 시도하면 NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments.mockResolvedValue(
          [
            {
              ...mockAttendanceLectureEnrollment,
              enrollmentId: 'valid-enrollment-id',
            } as unknown as Prisma.LectureEnrollmentGetPayload<{
              include: { enrollment: true };
            }>,
          ],
        );

        const invalidRequests = [
          {
            enrollmentId: 'invalid-enrollment-id',
            status: AttendanceStatus.PRESENT,
          },
        ];

        // Mock $transaction
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
          fn(mockPrisma),
        );

        await expect(
          attendancesService.createBulkAttendances(
            lectureId,
            { ...mockCreateBulkData, attendances: invalidRequests },
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('[단일 출결 등록] createAttendance', () => {
    const lectureId = mockLectures.basic.id;
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    describe('ATT-03: 단일 출결 등록 성공', () => {
      it('강사가 특정 강의의 수강생에 대해 출결 정보를 등록하거나 수정할 수 있다', async () => {
        // Mock LectureEnrollment 찾기
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
          {
            ...mockAttendanceLectureEnrollment,
            enrollment: { instructorId: instructorId },
          } as unknown as Prisma.LectureEnrollmentGetPayload<{
            include: { enrollment: true };
          }>,
        );

        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockAttendancesRepo.upsert.mockResolvedValue(mockAttendances.present);

        const result = await attendancesService.createAttendance(
          lectureId,
          enrollmentId,
          createAttendanceRequests.basic,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(mockAttendances.present);
        expect(
          mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId,
        ).toHaveBeenCalledWith(lectureId, enrollmentId);
        expect(mockAttendancesRepo.upsert).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            lectureId,
            enrollmentId,
            status: AttendanceStatus.PRESENT,
          }),
          expect.anything(),
        );
      });
    });

    describe('ATT-04: 단일 출결 등록 실패', () => {
      it('해당 강의에 등록되지 않은 수강생이면 NotFoundException을 던진다', async () => {
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
          null,
        );

        await expect(
          attendancesService.createAttendance(
            lectureId,
            'invalid-enrollment-id',
            createAttendanceRequests.basic,
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('[출결 조회] getAttendancesByLectureEnrollment', () => {
    const lectureId = mockLectures.basic.id;
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    describe('ATT-05: 출결 조회 성공', () => {
      it('권한이 있는 사용자가 특정 수강생의 전체 출결 목록과 통계를 조회할 수 있다', async () => {
        // Mock LectureEnrollment
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
          {
            ...mockAttendanceLectureEnrollment,
            enrollment: { ...mockEnrollments.active },
          } as unknown as Prisma.LectureEnrollmentGetPayload<{
            include: { enrollment: true };
          }>,
        );

        mockPermissionService.validateEnrollmentReadAccess.mockResolvedValue();

        // Mock Attendances
        mockAttendancesRepo.findByLectureEnrollmentId.mockResolvedValue([
          mockAttendances.present,
          mockAttendances.absent,
          mockAttendances.late,
        ]);

        const result =
          await attendancesService.getAttendancesByLectureEnrollment(
            lectureId,
            enrollmentId,
            UserType.INSTRUCTOR,
            instructorId,
          );

        expect(result.attendances).toHaveLength(3);
        expect(result.stats).toBeDefined();
        expect(result.stats.totalCount).toBe(3);
        expect(
          mockAttendancesRepo.findByLectureEnrollmentId,
        ).toHaveBeenCalledWith(mockAttendanceLectureEnrollment.id);
      });
    });

    describe('ATT-06: 출결 조회 실패', () => {
      it('해당 강의에 등록되지 않은 수강생이면 NotFoundException을 던진다', async () => {
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
          null,
        );

        await expect(
          attendancesService.getAttendancesByLectureEnrollment(
            lectureId,
            'invalid-enrollment-id',
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });
});
