import { AttendancesService } from './attendances.service.js';
import {
  BadRequestException,
  NotFoundException,
} from '../err/http.exception.js';
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
import { UserType } from '../constants/auth.constant.js';
import { AttendanceStatus } from '../constants/attendances.constant.js';
import { CreateBulkAttendancesDto } from '../validations/attendances.validation.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('AttendancesService - @unit #critical', () => {
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
  let mockTx: Prisma.TransactionClient;
  let attendancesService: AttendancesService;

  const mockTransaction = () => {
    mockTx = {} as Prisma.TransactionClient;
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
      fn(mockTx),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockAttendancesRepo = createMockAttendancesRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockAttendanceLectureEnrollmentsRepo =
      createMockLectureEnrollmentsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockAssistantRepo = createMockAssistantRepository();
    mockParentsService = createMockParentsService();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;

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
          enrollmentId,
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

    it('강사가 자신의 강의에 대해 여러 명의 출결 정보를 tx 안에서 등록하거나 수정할 수 있다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments.mockResolvedValue(
        [
          {
            ...mockAttendanceLectureEnrollment,
            enrollmentId,
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
      mockTransaction();

      const result = await attendancesService.createBulkAttendances(
        lectureId,
        mockCreateBulkData,
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(result).toHaveLength(2);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(1, lectureId);
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(
        2,
        lectureId,
        mockTx,
      );
      expect(
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments,
      ).toHaveBeenCalledWith(lectureId, mockTx);
      expect(mockAttendancesRepo.upsert).toHaveBeenCalledTimes(2);
      expect(
        mockAttendancesRepo.upsert.mock.calls.every(
          (call) => call[3] === mockTx,
        ),
      ).toBe(true);
    });

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

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('진행 중이 아닌 강의에는 단체 출결을 등록할 수 없다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.completed);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await expect(
        attendancesService.createBulkAttendances(
          lectureId,
          mockCreateBulkData,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments,
      ).not.toHaveBeenCalled();
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });

    it('바깥 조회 이후 강의 상태가 바뀌면 tx 내부 재검증에서 BadRequestException을 던진다', async () => {
      mockLecturesRepo.findById
        .mockResolvedValueOnce(mockLectures.basic)
        .mockResolvedValueOnce(mockLectures.completed);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await expect(
        attendancesService.createBulkAttendances(
          lectureId,
          mockCreateBulkData,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments,
      ).not.toHaveBeenCalled();
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });

    it('해당 강의의 수강생이 아닌 enrollmentId로 출결 등록을 시도하면 NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
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
      mockTransaction();

      await expect(
        attendancesService.createBulkAttendances(
          lectureId,
          {
            ...mockCreateBulkData,
            attendances: [
              {
                enrollmentId: 'invalid-enrollment-id',
                status: AttendanceStatus.PRESENT,
              },
            ],
          },
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findManyByLectureIdWithEnrollments,
      ).toHaveBeenCalledWith(lectureId, mockTx);
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('[단일 출결 등록] createAttendance', () => {
    const lectureId = mockLectures.basic.id;
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    it('강사가 특정 강의의 수강생에 대해 tx 안에서 출결 정보를 등록하거나 수정할 수 있다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        {
          ...mockAttendanceLectureEnrollment,
          enrollment: { instructorId },
        } as unknown as Prisma.LectureEnrollmentGetPayload<{
          include: { enrollment: true };
        }>,
      );
      mockAttendancesRepo.upsert.mockResolvedValue(mockAttendances.present);
      mockTransaction();

      const result = await attendancesService.createAttendance(
        lectureId,
        enrollmentId,
        createAttendanceRequests.basic,
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(result).toEqual(mockAttendances.present);
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(1, lectureId);
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(
        2,
        lectureId,
        mockTx,
      );
      expect(
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId,
      ).toHaveBeenCalledWith(lectureId, enrollmentId, mockTx);
      expect(mockAttendancesRepo.upsert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          lectureId,
          enrollmentId,
          status: AttendanceStatus.PRESENT,
        }),
        expect.anything(),
        mockTx,
      );
    });

    it('진행 중이 아닌 강의에는 단일 출결을 등록할 수 없다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.withEnrollments);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await expect(
        attendancesService.createAttendance(
          lectureId,
          enrollmentId,
          createAttendanceRequests.basic,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId,
      ).not.toHaveBeenCalled();
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });

    it('바깥 조회 이후 강의 상태가 바뀌면 tx 내부 재검증에서 BadRequestException을 던진다', async () => {
      mockLecturesRepo.findById
        .mockResolvedValueOnce(mockLectures.basic)
        .mockResolvedValueOnce(mockLectures.completed);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await expect(
        attendancesService.createAttendance(
          lectureId,
          enrollmentId,
          createAttendanceRequests.basic,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId,
      ).not.toHaveBeenCalled();
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });

    it('해당 강의에 등록되지 않은 수강생이면 NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        null,
      );
      mockTransaction();

      await expect(
        attendancesService.createAttendance(
          lectureId,
          'invalid-enrollment-id',
          createAttendanceRequests.basic,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId,
      ).toHaveBeenCalledWith(lectureId, 'invalid-enrollment-id', mockTx);
      expect(mockAttendancesRepo.upsert).not.toHaveBeenCalled();
    });
  });

  describe('[출결 조회] getAttendancesByLectureEnrollment', () => {
    const lectureId = mockLectures.basic.id;
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    it('권한이 있는 사용자가 특정 수강생의 전체 출결 목록과 통계를 조회할 수 있다', async () => {
      mockAttendanceLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        {
          ...mockAttendanceLectureEnrollment,
          enrollment: { ...mockEnrollments.active },
        } as unknown as Prisma.LectureEnrollmentGetPayload<{
          include: { enrollment: true };
        }>,
      );
      mockPermissionService.validateEnrollmentReadAccess.mockResolvedValue();
      mockAttendancesRepo.findByLectureEnrollmentId.mockResolvedValue([
        mockAttendances.present,
        mockAttendances.absent,
        mockAttendances.late,
      ]);

      const result = await attendancesService.getAttendancesByLectureEnrollment(
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

  describe('[출결 삭제] deleteAttendance', () => {
    const attendanceId = mockAttendances.present.id;
    const instructorId = mockInstructor.id;

    const persistedAttendance = {
      ...mockAttendances.present,
      lectureId: mockLectures.basic.id,
      enrollmentId: mockEnrollments.active.id,
      lectureEnrollmentId: mockAttendanceLectureEnrollment.id,
    };

    it('진행 중인 강의의 출결은 tx 안에서 삭제할 수 있다', async () => {
      mockAttendancesRepo.findById.mockResolvedValue(
        persistedAttendance as never,
      );
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await attendancesService.deleteAttendance(
        attendanceId,
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
      );
      expect(mockAttendancesRepo.findById).toHaveBeenNthCalledWith(
        1,
        attendanceId,
      );
      expect(mockAttendancesRepo.findById).toHaveBeenNthCalledWith(
        2,
        attendanceId,
        mockTx,
      );
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(
        1,
        persistedAttendance.lectureId,
      );
      expect(mockLecturesRepo.findById).toHaveBeenNthCalledWith(
        2,
        persistedAttendance.lectureId,
        mockTx,
      );
      expect(mockAttendancesRepo.delete).toHaveBeenCalledWith(
        attendanceId,
        mockTx,
      );
    });

    it('출결 정보가 없으면 NotFoundException을 던진다', async () => {
      mockAttendancesRepo.findById.mockResolvedValue(null);

      await expect(
        attendancesService.deleteAttendance(
          'missing-attendance-id',
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('바깥 조회 이후 강의 상태가 바뀌면 tx 내부 재검증에서 BadRequestException을 던진다', async () => {
      mockAttendancesRepo.findById.mockResolvedValue(
        persistedAttendance as never,
      );
      mockLecturesRepo.findById
        .mockResolvedValueOnce(mockLectures.basic)
        .mockResolvedValueOnce(mockLectures.completed);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockTransaction();

      await expect(
        attendancesService.deleteAttendance(
          attendanceId,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockAttendancesRepo.delete).not.toHaveBeenCalled();
    });
  });
});
