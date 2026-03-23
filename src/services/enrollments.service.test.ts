import { EnrollmentsService } from './enrollments.service.js';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '../err/http.exception.js';
import {
  createMockEnrollmentsRepository,
  createMockLecturesRepository,
  createMockLectureEnrollmentsRepository,
  createMockStudentRepository,
  createMockParentsService,
  createMockPermissionService,
  createMockPrisma,
} from '../test/mocks/index.js';
import {
  mockEnrollments,
  mockStudents,
  mockParents,
  mockParentLinks,
  mockAssistants,
  createEnrollmentRequests,
  updateEnrollmentRequests,
  mockEnrollmentWithRelations,
  mockEnrollmentsList,
  mockEnrollmentQueries,
} from '../test/fixtures/enrollments.fixture.js';
import {
  mockLectures,
  mockInstructor,
} from '../test/fixtures/lectures.fixture.js';
import { LectureStatus } from '../constants/lectures.constant.js';
import { UserType } from '../constants/auth.constant.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import { PrismaClient } from '../generated/prisma/client.js';

import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

type EnrollmentWithRelations = NonNullable<
  Awaited<ReturnType<EnrollmentsRepository['findByIdWithRelations']>>
>;

type EnrollmentWithLectures = NonNullable<
  Awaited<ReturnType<EnrollmentsRepository['findByIdWithLectures']>>
>;

type EnrollmentListItem = Awaited<
  ReturnType<EnrollmentsRepository['findMany']>
>['enrollments'][number];

type LectureEnrollmentListItem = Awaited<
  ReturnType<LectureEnrollmentsRepository['findManyByEnrollmentId']>
>[number];

type LectureEnrollmentDetail = NonNullable<
  Awaited<ReturnType<LectureEnrollmentsRepository['findByIdWithDetails']>>
>;

describe('EnrollmentsService - @unit #critical', () => {
  // Mock Dependencies
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockLecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let mockLectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let mockStudentRepo: ReturnType<typeof createMockStudentRepository>;
  let mockParentsService: ReturnType<typeof createMockParentsService>;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: PrismaClient;

  // Service under test
  let enrollmentsService: EnrollmentsService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockLecturesRepo = createMockLecturesRepository();
    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockStudentRepo = createMockStudentRepository();
    mockParentsService = createMockParentsService();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (callback) => {
        return await callback(mockPrisma);
      },
    );

    // Create EnrollmentsService DI
    enrollmentsService = new EnrollmentsService(
      mockEnrollmentsRepo,
      mockLecturesRepo,
      mockLectureEnrollmentsRepo,
      mockStudentRepo,
      mockParentsService,
      mockPermissionService,
      mockPrisma,
    );
  });

  /** [수강 생성] createEnrollment 테스트 케이스 */
  describe('[수강 생성] createEnrollment', () => {
    const lectureId = mockLectures.basic.id;
    const instructorId = mockInstructor.id;

    describe('ENR-01: 수강 생성 성공', () => {
      it('강사가 자신의 강의에 수강생 등록을 요청할 때, 수강 정보가 생성되고 반환된다', async () => {
        // 준비
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]); // 기존 수강생 없음
        mockEnrollmentsRepo.create.mockResolvedValue(mockEnrollments.active);

        // 첫 번째 조회: 기존 LectureEnrollment 없음
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );

        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId: lectureId,
          enrollmentId: mockEnrollments.active.id,
          registeredAt: new Date(),
        });

        // 두 번째 조회: 생성 후 조회 시 enrollment 정보 포함
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId: lectureId,
            enrollmentId: mockEnrollments.active.id,
            registeredAt: new Date(),
            enrollment: mockEnrollments.active,
          },
        );

        // 실행
        const result = await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        // 검증
        expect(result).toBeDefined();
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(lectureId);
        expect(
          mockEnrollmentsRepo.findManyByInstructorAndPhones,
        ).toHaveBeenCalledWith(
          instructorId,
          [createEnrollmentRequests.basic.studentPhone],
          mockPrisma,
        );
        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            instructorId,
            status: EnrollmentStatus.ACTIVE,
            studentName: createEnrollmentRequests.basic.studentName,
          }),
          mockPrisma,
        );
        expect(
          mockStudentRepo.findByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(
          createEnrollmentRequests.basic.studentPhone,
          createEnrollmentRequests.basic.parentPhone,
          mockPrisma,
        );
        expect(mockLectureEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lectureId,
            enrollmentId: mockEnrollments.active.id,
          }),
          mockPrisma,
        );
      });

      it('조교가 담당 강사의 강의에 수강생 등록을 요청할 때, 수강 정보가 생성되고 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockEnrollmentsRepo.create.mockResolvedValue(mockEnrollments.active);

        // 첫 번째 조회: 기존 LectureEnrollment 없음
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );

        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId: lectureId,
          enrollmentId: mockEnrollments.active.id,
          registeredAt: new Date(),
        });

        // 두 번째 조회: 생성 후 조회
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId: lectureId,
            enrollmentId: mockEnrollments.active.id,
            registeredAt: new Date(),
            enrollment: mockEnrollments.active,
          },
        );

        const result = await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId: mockLectures.basic.instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.ASSISTANT,
          mockAssistants.basic.id,
        );

        expect(result).toBeDefined();
        expect(
          mockPermissionService.validateInstructorAccess,
        ).toHaveBeenCalledWith(
          mockLectures.basic.instructorId,
          UserType.ASSISTANT,
          mockAssistants.basic.id,
        );
        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            instructorId: mockLectures.basic.instructorId,
            status: EnrollmentStatus.ACTIVE,
          }),
          mockPrisma,
        );
        expect(mockLectureEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            lectureId,
            enrollmentId: mockEnrollments.active.id,
          }),
          mockPrisma,
        );
      });

      it('수강생 등록 시 학생 전화번호와 부모 번호가 일치하면 앱 수강생을 자동 연결한다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockStudentRepo.findByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockStudents.basic,
        );
        mockEnrollmentsRepo.create.mockResolvedValue(mockEnrollments.active);

        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );
        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId: lectureId,
          enrollmentId: mockEnrollments.active.id,
          registeredAt: new Date(),
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId: lectureId,
            enrollmentId: mockEnrollments.active.id,
            registeredAt: new Date(),
            enrollment: mockEnrollments.active,
          },
        );

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(
          mockStudentRepo.findByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(
          createEnrollmentRequests.basic.studentPhone,
          createEnrollmentRequests.basic.parentPhone,
          mockPrisma,
        );
        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            appStudentId: mockStudents.basic.id,
          }),
          mockPrisma,
        );
      });

      it('registeredAt이 주어지면 개별 등록 시 해당 값으로 저장한다', async () => {
        const createData = createEnrollmentRequests.withRegisteredAt;

        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockEnrollmentsRepo.create.mockResolvedValue({
          ...mockEnrollments.active,
          registeredAt: createData.registeredAt,
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );
        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId,
          enrollmentId: mockEnrollments.active.id,
          registeredAt: new Date(),
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId,
            enrollmentId: mockEnrollments.active.id,
            registeredAt: new Date(),
            enrollment: {
              ...mockEnrollments.active,
              registeredAt: createData.registeredAt,
            },
          },
        );

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createData,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            registeredAt: createData.registeredAt,
          }),
          mockPrisma,
        );
      });

      it('기존 Enrollment를 재사용할 때 appStudentId가 비어 있으면 자동 연결을 보정한다', async () => {
        const existingEnrollment = {
          ...mockEnrollments.active,
          appStudentId: null,
          studentPhone: createEnrollmentRequests.basic.studentPhone,
          studentName: createEnrollmentRequests.basic.studentName,
          parentPhone: createEnrollmentRequests.basic.parentPhone,
        };

        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([
          existingEnrollment,
        ]);
        mockStudentRepo.findByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockStudents.basic,
        );
        mockEnrollmentsRepo.update.mockResolvedValue({
          ...existingEnrollment,
          appStudentId: mockStudents.basic.id,
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );
        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId,
          enrollmentId: existingEnrollment.id,
          registeredAt: new Date(),
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId,
            enrollmentId: existingEnrollment.id,
            registeredAt: new Date(),
            enrollment: {
              ...existingEnrollment,
              appStudentId: mockStudents.basic.id,
            },
          },
        );

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(
          mockStudentRepo.findByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(
          createEnrollmentRequests.basic.studentPhone,
          createEnrollmentRequests.basic.parentPhone,
          mockPrisma,
        );
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          existingEnrollment.id,
          {
            appStudent: {
              connect: {
                id: mockStudents.basic.id,
              },
            },
          },
          mockPrisma,
        );
        expect(mockEnrollmentsRepo.create).not.toHaveBeenCalled();
      });

      it('기존 Enrollment를 재사용할 때 appParentLinkId가 비어 있으면 자동 연결을 보정한다', async () => {
        const existingEnrollment = {
          ...mockEnrollments.active,
          appParentLinkId: null,
          studentPhone: createEnrollmentRequests.basic.studentPhone,
          studentName: createEnrollmentRequests.basic.studentName,
          parentPhone: createEnrollmentRequests.basic.parentPhone,
        };

        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([
          existingEnrollment,
        ]);
        mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockParentLinks.active,
        );
        mockEnrollmentsRepo.update.mockResolvedValue({
          ...existingEnrollment,
          appParentLinkId: mockParentLinks.active.id,
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );
        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId,
          enrollmentId: existingEnrollment.id,
          registeredAt: new Date(),
        });
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId,
            enrollmentId: existingEnrollment.id,
            registeredAt: new Date(),
            enrollment: {
              ...existingEnrollment,
              appParentLinkId: mockParentLinks.active.id,
            },
          },
        );

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(
          mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(
          createEnrollmentRequests.basic.studentPhone,
          createEnrollmentRequests.basic.parentPhone,
        );
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          existingEnrollment.id,
          {
            appParentLink: {
              connect: {
                id: mockParentLinks.active.id,
              },
            },
          },
          mockPrisma,
        );
        expect(mockEnrollmentsRepo.create).not.toHaveBeenCalled();
      });

      it('수강생 등록 시 학생 전화번호와 부모 번호가 학부모-자녀 링크와 일치할 때, ParentLink가 자동으로 연결된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockParentLinks.active,
        );
        mockEnrollmentsRepo.create.mockResolvedValue(mockEnrollments.active);

        // 첫 번째 조회: 기존 LectureEnrollment 없음
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          null,
        );

        mockLectureEnrollmentsRepo.create.mockResolvedValue({
          id: 'le-1',
          memo: null,
          lectureId: lectureId,
          enrollmentId: mockEnrollments.active.id,
          registeredAt: new Date(),
        });

        // 두 번째 조회: 생성 후 조회
        mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValueOnce(
          {
            id: 'le-1',
            memo: null,
            lectureId: lectureId,
            enrollmentId: mockEnrollments.active.id,
            registeredAt: new Date(),
            enrollment: mockEnrollments.active,
          },
        );

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.basic,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(
          mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(
          createEnrollmentRequests.basic.studentPhone,
          createEnrollmentRequests.basic.parentPhone,
        );
        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            appParentLinkId: mockParentLinks.active.id,
          }),
          mockPrisma,
        );
      });

      it('수강생 등록 시 ParentLinkId가 직접 제공될 때, 전화번호 검색 없이 해당 링크로 연결된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockEnrollmentsRepo.create.mockResolvedValue(mockEnrollments.active);

        await enrollmentsService.createEnrollment(
          lectureId,
          {
            ...createEnrollmentRequests.withParentLink,
            instructorId,
            status: EnrollmentStatus.ACTIVE,
          },
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(
          mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber,
        ).not.toHaveBeenCalled();
        expect(mockEnrollmentsRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            appParentLinkId:
              createEnrollmentRequests.withParentLink.appParentLinkId,
          }),
          mockPrisma,
        );
      });
    });

    describe('ENR-02: 수강 생성 실패 - 강의 검증', () => {
      it('사용자가 존재하지 않는 강의 ID로 수강생 등록을 요청할 때, NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          enrollmentsService.createEnrollment(
            'invalid-lecture-id',
            {
              ...createEnrollmentRequests.basic,
              instructorId,
              status: EnrollmentStatus.ACTIVE,
            },
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
          'invalid-lecture-id',
        );
      });
    });

    describe('ENR-03: 수강 생성 실패 - 권한 검증', () => {
      it('강사가 다른 강사의 강의에 수강생 등록을 요청할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(
          mockLectures.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 권한이 없습니다.'),
        );

        await expect(
          enrollmentsService.createEnrollment(
            mockLectures.otherInstructor.id,
            {
              ...createEnrollmentRequests.basic,
              instructorId,
              status: EnrollmentStatus.ACTIVE,
            },
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('조교가 담당 강사가 아닌 다른 강사의 강의에 수강생 등록을 요청할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 권한이 없습니다.'),
        );

        await expect(
          enrollmentsService.createEnrollment(
            lectureId,
            {
              ...createEnrollmentRequests.basic,
              instructorId: mockLectures.basic.instructorId,
              status: EnrollmentStatus.ACTIVE,
            },
            UserType.ASSISTANT,
            mockAssistants.otherInstructor.id,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  /** [수강 마이그레이션] createEnrollmentMigration 테스트 케이스 */
  describe('[수강 마이그레이션] createEnrollmentMigration', () => {
    const lectureId = mockLectures.basic.id;
    const instructorId = mockInstructor.id;
    const enrollmentIds = ['e-1', 'e-2', 'e-3'];

    it('성공: 새로운 학생들을 일괄 등록한다', async () => {
      // 준비
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findManyByLectureId.mockResolvedValue([]); // 기존 등록 없음
      mockLectureEnrollmentsRepo.createMany.mockResolvedValue(
        enrollmentIds.map((id) => ({ enrollmentId: id })) as unknown as Awaited<
          ReturnType<LectureEnrollmentsRepository['createMany']>
        >,
      );

      // 실행
      const result = await enrollmentsService.createEnrollmentMigration(
        lectureId,
        { enrollmentIds, memo: 'migration memo' },
        UserType.INSTRUCTOR,
        instructorId,
      );

      // 검증
      expect(result.count).toBe(3);
      expect(mockLectureEnrollmentsRepo.createMany).toHaveBeenCalledWith(
        enrollmentIds.map((eid) => ({
          lectureId,
          enrollmentId: eid,
          memo: 'migration memo',
        })),
      );
    });

    it('성공: 중복된 학생은 제외하고 새로운 학생만 등록한다', async () => {
      // 준비
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findManyByLectureId.mockResolvedValue([
        { enrollmentId: 'e-1' }, // e-1은 이미 등록됨
      ] as unknown as Awaited<
        ReturnType<LectureEnrollmentsRepository['findManyByLectureId']>
      >);
      mockLectureEnrollmentsRepo.createMany.mockResolvedValue([
        { enrollmentId: 'e-2' },
        { enrollmentId: 'e-3' },
      ] as unknown as Awaited<
        ReturnType<LectureEnrollmentsRepository['createMany']>
      >);

      // 실행
      const result = await enrollmentsService.createEnrollmentMigration(
        lectureId,
        { enrollmentIds },
        UserType.INSTRUCTOR,
        instructorId,
      );

      // 검증
      expect(result.count).toBe(2);
      expect(mockLectureEnrollmentsRepo.createMany).toHaveBeenCalledWith([
        { lectureId, enrollmentId: 'e-2' },
        { lectureId, enrollmentId: 'e-3' },
      ]);
    });

    it('성공: 모든 학생이 이미 등록된 경우 등록하지 않는다', async () => {
      // 준비
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findManyByLectureId.mockResolvedValue(
        enrollmentIds.map((id) => ({ enrollmentId: id })) as unknown as Awaited<
          ReturnType<LectureEnrollmentsRepository['findManyByLectureId']>
        >,
      );

      // 실행
      const result = await enrollmentsService.createEnrollmentMigration(
        lectureId,
        { enrollmentIds },
        UserType.INSTRUCTOR,
        instructorId,
      );

      // 검증
      expect(result.count).toBe(0);
      expect(mockLectureEnrollmentsRepo.createMany).not.toHaveBeenCalled();
    });

    it('실패: 강의가 존재하지 않으면 NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        enrollmentsService.createEnrollmentMigration(
          'invalid',
          { enrollmentIds },
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('실패: 권한이 없으면 ForbiddenException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      mockPermissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        enrollmentsService.createEnrollmentMigration(
          lectureId,
          { enrollmentIds },
          UserType.INSTRUCTOR,
          'other-id',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  /** [수강생 목록 조회] getEnrollments 테스트 케이스 */
  describe('[수강생 목록 조회] getEnrollments', () => {
    const lectureId = mockLectures.basic.id;
    const instructorId = mockInstructor.id;

    describe('ENR-04: 강의별 수강생 목록 조회 성공 (lectureId 포함)', () => {
      it('강사가 자신의 강의 수강생 목록 조회를 요청할 때, 해당 강의의 모든 수강 정보 목록이 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockEnrollmentsList as unknown as Awaited<
            ReturnType<EnrollmentsRepository['findMany']>
          >['enrollments'],
          totalCount: mockEnrollmentsList.length,
        });

        const result = await enrollmentsService.getEnrollments(
          UserType.INSTRUCTOR,
          instructorId,
          { lecture: lectureId, ...mockEnrollmentQueries.withPagination },
        );

        const expectedEnrollments = (
          mockEnrollmentsList as unknown as EnrollmentListItem[]
        ).map((e) => {
          const { attendances, lectureEnrollments, ...rest } = e;
          return {
            ...rest,
            attendance: attendances?.[0] || null,
            lectureEnrollmentId: lectureEnrollments?.[0]?.id,
            lectureEnrollments: lectureEnrollments,
            lecture: null, // Mock data doesn't have active lecture logic setup implies null
          };
        });

        expect(result.enrollments).toEqual(expectedEnrollments);
        expect(result.totalCount).toBe(mockEnrollmentsList.length);
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(lectureId);
        expect(mockEnrollmentsRepo.findMany).toHaveBeenCalledWith(
          instructorId,
          {
            lecture: lectureId,
            lectureId: lectureId,
            ...mockEnrollmentQueries.withPagination,
            examId: undefined,
          },
        );
      });

      it('조교가 담당 강사의 강의 수강생 목록 조회를 요청할 때, 해당 강의의 모든 수강 정보 목록이 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockEnrollmentsList as unknown as Awaited<
            ReturnType<EnrollmentsRepository['findMany']>
          >['enrollments'],
          totalCount: mockEnrollmentsList.length,
        });

        const result = await enrollmentsService.getEnrollments(
          UserType.ASSISTANT,
          mockAssistants.basic.id,
          { lecture: lectureId, ...mockEnrollmentQueries.withPagination },
        );

        const expectedEnrollments = (
          mockEnrollmentsList as unknown as EnrollmentListItem[]
        ).map((e) => {
          const { attendances, lectureEnrollments, ...rest } = e;
          return {
            ...rest,
            attendance: attendances?.[0] || null,
            lectureEnrollmentId: lectureEnrollments?.[0]?.id,
            lectureEnrollments: lectureEnrollments,
            lecture: null,
          };
        });

        expect(result.enrollments).toEqual(expectedEnrollments);
        expect(
          mockPermissionService.validateInstructorAccess,
        ).toHaveBeenCalledWith(
          mockLectures.basic.instructorId,
          UserType.ASSISTANT,
          mockAssistants.basic.id,
        );
        expect(mockEnrollmentsRepo.findMany).toHaveBeenCalledWith(
          mockLectures.basic.instructorId,
          {
            lecture: lectureId,
            lectureId: lectureId,
            ...mockEnrollmentQueries.withPagination,
            examId: undefined,
          },
        );
      });

      it('ENR-04-1: examId 전달 시 해당 시험 성적 ID 포함 확인', async () => {
        const examId = 'exam-123';
        const gradeId = 'grade-456';
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);

        // 성적이 있는 1번 학생과 성적이 없는 2번 학생 시뮬레이션
        const mockEnrollmentsWithGrades = [
          {
            ...mockEnrollmentsList[0],
            grades: [{ id: gradeId }],
            appStudent: mockStudents.basic,
          },
          {
            ...mockEnrollmentsList[1],
            grades: [],
            appStudent: mockStudents.withParentLink,
          },
        ];

        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockEnrollmentsWithGrades.map((e) => ({
            ...e,
            lectureEnrollments: [],
          })) as unknown as EnrollmentListItem[],
          totalCount: mockEnrollmentsWithGrades.length,
        });

        await enrollmentsService.getEnrollments(
          UserType.INSTRUCTOR,
          instructorId,
          {
            lecture: lectureId,
            examId,
            ...mockEnrollmentQueries.withPagination,
          },
        );

        expect(mockEnrollmentsRepo.findMany).toHaveBeenCalledWith(
          instructorId,
          {
            lecture: lectureId,
            lectureId: lectureId,
            examId,
            ...mockEnrollmentQueries.withPagination,
          },
        );
      });
    });

    describe('ENR-05: 강의별 수강생 목록 조회 실패', () => {
      it('사용자가 존재하지 않는 강의 ID로 수강생 목록 조회를 요청할 때, NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          enrollmentsService.getEnrollments(UserType.INSTRUCTOR, instructorId, {
            lecture: 'invalid-lecture-id',
            ...mockEnrollmentQueries.withPagination,
          }),
        ).rejects.toThrow(NotFoundException);
      });

      it('강사가 다른 강사의 강의 수강생 목록 조회를 요청할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(
          mockLectures.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 권한이 없습니다.'),
        );

        await expect(
          enrollmentsService.getEnrollments(UserType.INSTRUCTOR, instructorId, {
            lecture: mockLectures.otherInstructor.id,
            ...mockEnrollmentQueries.withPagination,
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ENR-06: 강사별 전체 수강생 목록 조회 성공 (lectureId 미포함)', () => {
      it('강사가 본인 소속 모든 수강생 목록 조회를 요청할 때, 페이지네이션이 적용된 목록과 전체 개수가 반환된다', async () => {
        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockEnrollmentsList as unknown as Awaited<
            ReturnType<EnrollmentsRepository['findMany']>
          >['enrollments'],
          totalCount: mockEnrollmentsList.length,
        });

        const result = await enrollmentsService.getEnrollments(
          UserType.INSTRUCTOR,
          instructorId,
          mockEnrollmentQueries.withPagination,
        );

        const expectedEnrollments = (
          mockEnrollmentsList as unknown as EnrollmentListItem[]
        ).map((e) => {
          const { attendances, lectureEnrollments, ...rest } = e;
          return {
            ...rest,
            attendance: attendances?.[0] || null,
            lectureEnrollmentId: lectureEnrollments?.[0]?.id,
            lectureEnrollments: lectureEnrollments,
            lecture: null,
          };
        });

        expect(result).toEqual({
          enrollments: expectedEnrollments,
          totalCount: mockEnrollmentsList.length,
        });
        expect(
          mockPermissionService.getEffectiveInstructorId,
        ).toHaveBeenCalledWith(UserType.INSTRUCTOR, instructorId);
      });

      it('조교가 담당 강사 소속 모든 수강생 목록 조회를 요청할 때, 페이지네이션이 적용된 목록과 전체 개수가 반환된다', async () => {
        mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
          instructorId,
        );
        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockEnrollmentsList as unknown as Awaited<
            ReturnType<EnrollmentsRepository['findMany']>
          >['enrollments'],
          totalCount: mockEnrollmentsList.length,
        });

        const result = await enrollmentsService.getEnrollments(
          UserType.ASSISTANT,
          mockAssistants.basic.id,
          mockEnrollmentQueries.withPagination,
        );

        const expectedEnrollments = (
          mockEnrollmentsList as unknown as EnrollmentListItem[]
        ).map((e) => {
          const { attendances, lectureEnrollments, ...rest } = e;
          return {
            ...rest,
            attendance: attendances?.[0] || null,
            lectureEnrollmentId: lectureEnrollments?.[0]?.id,
            lectureEnrollments: lectureEnrollments,
            lecture: null,
          };
        });

        expect(result).toEqual({
          enrollments: expectedEnrollments,
          totalCount: mockEnrollmentsList.length,
        });
        expect(
          mockPermissionService.getEffectiveInstructorId,
        ).toHaveBeenCalledWith(UserType.ASSISTANT, mockAssistants.basic.id);
        expect(mockEnrollmentsRepo.findMany).toHaveBeenCalledWith(
          instructorId,
          mockEnrollmentQueries.withPagination,
        );
      });

      it('ENR-06-1: Active Lecture Selection Logic - Status & EndDate Check', async () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        const pastDate = new Date();
        pastDate.setFullYear(pastDate.getFullYear() - 1);

        const mockLectureActive = {
          ...mockLectures.basic,
          id: 'active',
          status: LectureStatus.IN_PROGRESS,
          endAt: futureDate,
        };
        const mockLectureExpired = {
          ...mockLectures.basic,
          id: 'expired',
          status: LectureStatus.IN_PROGRESS,
          endAt: pastDate,
        };
        const mockLectureScheduled = {
          ...mockLectures.basic,
          id: 'scheduled',
          status: LectureStatus.SCHEDULED,
          endAt: futureDate,
        };

        // Scenario 1: Has Active Lecture (should be picked even if not first in list)
        // List: [Expired (Recent), Active (Old)]
        // Expected: Active
        const enrollmentWithActive = {
          ...mockEnrollmentsList[0],
          lectureEnrollments: [
            {
              id: 'le-1',
              lecture: mockLectureExpired,
              registeredAt: new Date(),
            },
            {
              id: 'le-2',
              lecture: mockLectureActive,
              registeredAt: new Date(),
            },
          ],
        };

        // Scenario 2: No Active Lecture (fallback to most recent)
        // List: [Expired (Recent), Scheduled (Old)]
        // Expected: Expired (index 0)
        const enrollmentFallback = {
          ...mockEnrollmentsList[1],
          lectureEnrollments: [
            {
              id: 'le-3',
              lecture: mockLectureExpired,
              registeredAt: new Date(),
            },
            {
              id: 'le-4',
              lecture: mockLectureScheduled,
              registeredAt: new Date(),
            },
          ],
        };

        const mockData = [enrollmentWithActive, enrollmentFallback];

        mockEnrollmentsRepo.findMany.mockResolvedValue({
          enrollments: mockData as unknown as Awaited<
            ReturnType<EnrollmentsRepository['findMany']>
          >['enrollments'],
          totalCount: 2,
        });

        const result = await enrollmentsService.getEnrollments(
          UserType.INSTRUCTOR,
          instructorId,
          mockEnrollmentQueries.withPagination,
        );

        expect(result.enrollments[0].lecture).toEqual(mockLectureActive);
        expect(result.enrollments[1].lecture).toEqual(mockLectureExpired);
      });
    });
  });

  /** [수강 상세 조회] getEnrollmentDetail 테스트 케이스 */
  describe('[수강 상세 조회] getEnrollmentDetail', () => {
    const lectureEnrollmentId = 'le-1';
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    describe('ENR-07: 수강 상세 조회 성공 (EnrollmentId 기준)', () => {
      it('강사가 enrollmentId로 수강생 상세 정보 조회를 요청할 때, 성공한다', async () => {
        mockEnrollmentsRepo.findByIdWithLectures.mockResolvedValue(
          mockEnrollmentWithRelations,
        );

        const result = await enrollmentsService.getEnrollmentDetail(
          enrollmentId,
          UserType.INSTRUCTOR,
          instructorId,
        );

        const { lectureEnrollments, ...expectedBase } =
          mockEnrollmentWithRelations;
        const expectedLectures = (
          lectureEnrollments as NonNullable<EnrollmentWithLectures>['lectureEnrollments']
        ).map((le) => ({
          ...le.lecture,
          lectureEnrollmentId: le.id,
          registeredAt: le.registeredAt,
        }));

        expect(result).toEqual({
          ...expectedBase,
          instructor: undefined,
          instructorName: mockEnrollmentWithRelations.instructor.user.name,
          instructorPhoneNumber:
            mockEnrollmentWithRelations.instructor.phoneNumber,
          lectures: expectedLectures,
        });
        expect(mockEnrollmentsRepo.findByIdWithLectures).toHaveBeenCalledWith(
          enrollmentId,
        );
      });
    });

    describe('ENR-07-2: 수강 상세 조회 성공 (LectureEnrollmentId 기준)', () => {
      it('강사가 lectureEnrollmentId로 수강생 상세 정보 조회를 요청할 때, 성공한다', async () => {
        mockLectureEnrollmentsRepo.findById.mockResolvedValue({
          id: lectureEnrollmentId,
          memo: null,
          enrollmentId,
          lectureId: 'lecture-1',
          registeredAt: new Date(),
        });
        mockEnrollmentsRepo.findByIdWithLectures.mockResolvedValue(
          mockEnrollmentWithRelations,
        );

        const result =
          await enrollmentsService.getEnrollmentDetailByLectureEnrollmentId(
            lectureEnrollmentId,
            UserType.INSTRUCTOR,
            instructorId,
          );

        expect(result).toBeDefined();
        expect(mockLectureEnrollmentsRepo.findById).toHaveBeenCalledWith(
          lectureEnrollmentId,
        );
        expect(mockEnrollmentsRepo.findByIdWithLectures).toHaveBeenCalledWith(
          enrollmentId,
        );
      });
    });

    describe('ENR-07-3: Include lectureTimes in enrollment detail', () => {
      it('수강 상세 조회 시 강의 시간표(lectureTimes)가 포함되어 반환된다', async () => {
        const mockLectureTimes = [
          {
            id: 'time-1',
            day: 'MON',
            startTime: '14:00',
            endTime: '16:00',
            lectureId: 'lecture-1',
            instructorId: instructorId,
          },
        ];
        const mockEnrollmentWithTimetable = {
          ...mockEnrollmentWithRelations,
          lectureEnrollments: [
            {
              ...mockEnrollmentWithRelations.lectureEnrollments[0],
              lecture: {
                ...mockEnrollmentWithRelations.lectureEnrollments[0].lecture,
                lectureTimes: mockLectureTimes,
              },
            },
          ],
        };

        mockEnrollmentsRepo.findByIdWithLectures.mockResolvedValue(
          mockEnrollmentWithTimetable,
        );

        const result = await enrollmentsService.getEnrollmentDetail(
          enrollmentId,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result.lectures[0].lectureTimes).toEqual(mockLectureTimes);
      });
    });

    describe('ENR-08: 수강 상세 조회 실패', () => {
      it('존재하지 않는 EnrollmentId로 조회 시 NotFoundException을 던진다', async () => {
        mockEnrollmentsRepo.findByIdWithLectures.mockResolvedValue(null);

        await expect(
          enrollmentsService.getEnrollmentDetail(
            'invalid-id',
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('존재하지 않는 LectureEnrollmentId로 조회 시 NotFoundException을 던진다', async () => {
        mockLectureEnrollmentsRepo.findById.mockResolvedValue(null);

        await expect(
          enrollmentsService.getEnrollmentDetailByLectureEnrollmentId(
            'invalid-le-id',
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  /** [수강 정보 수정] updateEnrollment 테스트 케이스 */
  describe('[수강 정보 수정] updateEnrollment', () => {
    const enrollmentId = mockEnrollments.active.id;
    const instructorId = mockInstructor.id;

    describe('ENR-09: 수강 정보 수정 성공', () => {
      it('강사가 모든 유효한 필드를 포함하여 수강 정보 수정을 요청할 때, 정보가 업데이트되고 반영된 결과가 반환된다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.active as unknown as EnrollmentWithRelations,
        );
        const updatedEnrollment = {
          ...mockEnrollments.active,
          ...updateEnrollmentRequests.full,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateEnrollmentRequests.full,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          enrollmentId,
          updateEnrollmentRequests.full,
        );
      });

      it('강사가 일부 필드만 포함하여 수강 정보 수정을 요청할 때, 해당 필드만 업데이트되고 결과가 반환된다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.active as unknown as EnrollmentWithRelations,
        );
        const updatedEnrollment = {
          ...mockEnrollments.active,
          ...updateEnrollmentRequests.partial,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateEnrollmentRequests.partial,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          enrollmentId,
          updateEnrollmentRequests.partial,
        );
      });

      it('registeredAt이 주어지면 수강 정보 수정 시 해당 값으로 반영한다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.active as unknown as EnrollmentWithRelations,
        );
        const updatedEnrollment = {
          ...mockEnrollments.active,
          ...updateEnrollmentRequests.withRegisteredAt,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateEnrollmentRequests.withRegisteredAt,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          enrollmentId,
          updateEnrollmentRequests.withRegisteredAt,
        );
      });

      it('조교가 담당 강사 소속 수강생의 정보 수정을 요청할 때, 수강 정보가 업데이트되고 결과가 반환된다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.active as unknown as EnrollmentWithRelations,
        );
        mockPermissionService.validateInstructorAccess.mockResolvedValue();
        const updatedEnrollment = {
          ...mockEnrollments.active,
          ...updateEnrollmentRequests.partial,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateEnrollmentRequests.partial,
          UserType.ASSISTANT,
          mockAssistants.basic.id,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(
          mockPermissionService.validateInstructorAccess,
        ).toHaveBeenCalled();
      });

      it('학생 전화번호와 부모 번호가 일치하면 앱 학생을 자동 연결한다', async () => {
        const updateData = {
          ...updateEnrollmentRequests.full,
          studentPhone: '010-1111-1111',
          studentName: '홍길동',
          parentPhone: '010-2222-2222',
        };
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.active as unknown as EnrollmentWithRelations,
        );
        mockStudentRepo.findByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockStudents.basic,
        );
        const updatedEnrollment = {
          ...mockEnrollments.active,
          ...updateData,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateData,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(
          mockStudentRepo.findByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(updateData.studentPhone, updateData.parentPhone);
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          enrollmentId,
          expect.objectContaining({
            ...updateData,
            appStudent: {
              connect: {
                id: mockStudents.basic.id,
              },
            },
          }),
        );
      });

      it('수강생 수정 시 ParentLink도 학생 전화번호와 부모 번호가 일치하면 연결된다', async () => {
        const updateData = {
          studentPhone: '010-1111-1111',
          parentPhone: '010-2222-2222',
        };
        const existingEnrollment = {
          ...mockEnrollments.active,
          studentName: '홍길동',
          studentPhone: '010-9999-9999',
          parentPhone: '010-3333-3333',
        } as EnrollmentWithRelations;

        mockEnrollmentsRepo.findById.mockResolvedValue(existingEnrollment);
        mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber.mockResolvedValue(
          mockParentLinks.active,
        );
        const updatedEnrollment = {
          ...existingEnrollment,
          ...updateData,
        };
        mockEnrollmentsRepo.update.mockResolvedValue(updatedEnrollment);

        const result = await enrollmentsService.updateEnrollment(
          enrollmentId,
          updateData,
          UserType.INSTRUCTOR,
          instructorId,
        );

        expect(result).toEqual(updatedEnrollment);
        expect(
          mockParentsService.findLinkByPhoneNumberAndParentPhoneNumber,
        ).toHaveBeenCalledWith(updateData.studentPhone, updateData.parentPhone);
        expect(mockEnrollmentsRepo.update).toHaveBeenCalledWith(
          enrollmentId,
          expect.objectContaining({
            ...updateData,
            appParentLink: {
              connect: {
                id: mockParentLinks.active.id,
              },
            },
          }),
        );
      });
    });

    describe('ENR-10: 수강 정보 수정 실패', () => {
      it('사용자가 존재하지 않는 수강 ID로 수강 정보 수정을 요청할 때, NotFoundException을 던진다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(null);

        await expect(
          enrollmentsService.updateEnrollment(
            'invalid-enrollment-id',
            updateEnrollmentRequests.partial,
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('강사가 다른 강사 소속 수강생의 정보를 수정하려 할 때, ForbiddenException을 던진다', async () => {
        mockEnrollmentsRepo.findById.mockResolvedValue(
          mockEnrollments.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 권한이 없습니다.'),
        );

        await expect(
          enrollmentsService.updateEnrollment(
            mockEnrollments.otherInstructor.id,
            updateEnrollmentRequests.partial,
            UserType.INSTRUCTOR,
            instructorId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  /** [학생/학부모용] getMyEnrollments 테스트 케이스 (EnrollmentCentric) */
  describe('[학생/학부모용] getMyEnrollments', () => {
    describe('ENR-13: 학생 강사 목록 조회', () => {
      it('학생이 본인의 강사 목록 조회를 요청할 때, 페이지네이션이 적용된 Enrollment 목록이 반환된다 (memo 제외)', async () => {
        const studentId = mockStudents.basic.id;

        // Mock Enrollment List
        const mockEnrollmentList = [
          {
            ...mockEnrollments.active,
            memo: 'secret memo',
            instructor: {
              ...mockInstructor,
              user: { name: 'Instructor Name' },
            },
          },
        ];

        mockEnrollmentsRepo.findByAppStudentId.mockResolvedValue({
          enrollments: mockEnrollmentList,
          totalCount: 1,
        });

        const result = await enrollmentsService.getMyEnrollments(
          UserType.STUDENT,
          studentId,
          mockEnrollmentQueries.withPagination,
        );

        expect(result.enrollments).toHaveLength(1);
        expect(result.enrollments[0]).not.toHaveProperty('memo');
        expect(result.enrollments[0].studentName).toBe(
          mockEnrollments.active.studentName,
        );
        expect(result.totalCount).toBe(1);
        expect(mockEnrollmentsRepo.findByAppStudentId).toHaveBeenCalledWith(
          studentId,
          mockEnrollmentQueries.withPagination,
        );
      });
    });

    describe('getEnrollmentLectures: 강사별 강의 목록 조회', () => {
      it('학생이 특정 강사의 강의 목록을 요청할 때, 해당 Enrollment에 속한 강의 목록이 반환된다', async () => {
        const studentId = mockStudents.basic.id;
        const enrollmentId = mockEnrollments.active.id;

        mockEnrollmentsRepo.findById.mockResolvedValue(mockEnrollments.active);
        const mockLectureEnrollments: LectureEnrollmentListItem[] = [
          {
            id: 'le-1',
            memo: null,
            lectureId: mockLectures.basic.id,
            enrollmentId,
            registeredAt: new Date(),
            lecture: {
              id: mockLectures.basic.id,
              instructorId: mockLectures.basic.instructorId,
              subject: mockLectures.basic.subject,
              schoolYear: mockLectures.basic.schoolYear,
              title: 'Lecture 1',
              description: mockLectures.basic.description,
              status: mockLectures.basic.status,
              createdAt: mockLectures.basic.createdAt,
              updatedAt: mockLectures.basic.updatedAt,
              startAt: mockLectures.basic.startAt,
              endAt: mockLectures.basic.endAt,
              deletedAt: null,
              instructor: {
                user: {
                  name: 'Instructor Name',
                },
              },
              lectureTimes: [],
            },
          },
        ];
        mockLectureEnrollmentsRepo.findManyByEnrollmentId.mockResolvedValue(
          mockLectureEnrollments,
        );

        const result = await enrollmentsService.getEnrollmentLectures(
          enrollmentId,
          UserType.STUDENT,
          studentId,
        );

        expect(result.lectureEnrollments).toEqual(
          mockLectureEnrollments.map(({ memo: _memo, ...rest }) => rest),
        );
        expect(
          mockLectureEnrollmentsRepo.findManyByEnrollmentId,
        ).toHaveBeenCalledWith(enrollmentId);
      });

      it('다른 학생의 Enrollment에 접근하려 할 때 ForbiddenException을 던진다', async () => {
        const studentId = 'another-student';
        const enrollmentId = mockEnrollments.active.id;

        mockEnrollmentsRepo.findById.mockResolvedValue(mockEnrollments.active); // active has different appStudentId

        await expect(
          enrollmentsService.getEnrollmentLectures(
            enrollmentId,
            UserType.STUDENT,
            studentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ENR-14: 학부모 수강 목록 조회', () => {
      it('학부모가 자녀들의 전체 수강 목록 조회를 요청할 때, ForbiddenException을 던진다 (학부모는 getMyEnrollments 사용 불가)', async () => {
        const parentId = mockParents.basic.id;

        await expect(
          enrollmentsService.getMyEnrollments(UserType.PARENT, parentId),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ENR-15: 수강 목록 조회 실패', () => {
      it('학생/학부모가 아닌 사용자가 전용 수강 목록 조회를 요청할 때, ForbiddenException을 던진다', async () => {
        await expect(
          enrollmentsService.getMyEnrollments(
            UserType.INSTRUCTOR,
            mockInstructor.id,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  /** [학생/학부모용 상세] getEnrollmentById (LectureCentric) 테스트 케이스 */
  describe('[학생/학부모용 상세] getEnrollmentById', () => {
    const lectureEnrollmentId = 'le-123';

    // Mock LectureEnrollment Detail Data
    const mockLectureEnrollmentDetail = {
      id: lectureEnrollmentId,
      lectureId: 'lecture-1',
      enrollmentId: 'enrollment-1',
      registeredAt: new Date(),
      deletedAt: null,
      enrollment: {
        appStudentId: mockStudents.basic.id,
        appParentLinkId: mockParentLinks.active.id,
        studentName: 'Student Name',
      },
      lecture: {
        ...mockLectures.basic,
        instructor: { user: { name: 'Instructor Name' } },
        exams: [],
      },
      grades: [],
      attendances: [],
    };

    describe('ENR-16: 학생 수강 상세 조회', () => {
      it('학생이 본인의 수강 상세 정보 조회를 요청할 때, 상세 수강(LectureEnrollment) 정보가 반환된다', async () => {
        const studentId = mockStudents.basic.id;

        mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
          mockLectureEnrollmentDetail as unknown as LectureEnrollmentDetail,
        );
        mockPermissionService.validateEnrollmentReadAccess.mockResolvedValue();

        const result = await enrollmentsService.getEnrollmentById(
          lectureEnrollmentId,
          UserType.STUDENT,
          studentId,
        );

        expect(result).toBeDefined();
        expect(result.id).toBe(lectureEnrollmentId);

        // 권한 체크 로직 검증 (직접 체크 + permissionService 호출)
        expect(
          mockPermissionService.validateEnrollmentReadAccess,
        ).toHaveBeenCalled();
      });

      it('학생이 다른 학생의 수강 상세 정보를 조회하려 할 때, ForbiddenException을 던진다 (appStudentId 불일치)', async () => {
        const anotherStudentId = mockStudents.another.id;

        mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
          mockLectureEnrollmentDetail as unknown as LectureEnrollmentDetail,
        );

        // 직접 체크 로직에서 걸려야 함
        await expect(
          enrollmentsService.getEnrollmentById(
            lectureEnrollmentId,
            UserType.STUDENT,
            anotherStudentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ENR-17: 학부모 수강 상세 조회', () => {
      it('학부모가 본인 자녀의 수강 상세 정보 조회를 요청할 때, 상세 수강 정보가 반환된다', async () => {
        const parentId = mockParents.basic.id;

        // Parent case: enrollment has appParentLinkId
        // Need to ensure validation logic passes.
        // Assuming validation passes inside service or helper mock.
        mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
          mockLectureEnrollmentDetail as unknown as LectureEnrollmentDetail,
        );
        mockPermissionService.validateEnrollmentReadAccess.mockResolvedValue();

        const result = await enrollmentsService.getEnrollmentById(
          lectureEnrollmentId,
          UserType.PARENT,
          parentId,
        );

        expect(result).toBeDefined();
        expect(result.id).toBe(lectureEnrollmentId);
      });

      it('연결되지 않은 자녀 정보(appParentLinkId null) 조회 시 ForbiddenException', async () => {
        const parentId = mockParents.basic.id;
        const mockNoLink = {
          ...mockLectureEnrollmentDetail,
          enrollment: {
            ...mockLectureEnrollmentDetail.enrollment,
            appParentLinkId: null,
          },
        };

        mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
          mockNoLink as unknown as LectureEnrollmentDetail,
        );

        await expect(
          enrollmentsService.getEnrollmentById(
            lectureEnrollmentId,
            UserType.PARENT,
            parentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('ENR-18: 수강 상세 조회 실패', () => {
      it('존재하지 않는 ID로 상세 조회를 요청할 때, NotFoundException을 던진다', async () => {
        mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(null);

        await expect(
          enrollmentsService.getEnrollmentById(
            'invalid-id',
            UserType.STUDENT,
            mockStudents.basic.id,
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  /** [Helper 함수] getEffectiveInstructorId 테스트 케이스 */
  describe('[Helper 함수] getEffectiveInstructorId', () => {
    it('조교가 강사 소속 정보 조회를 요청할 때, 담당 강사의 ID가 효과적인 ID로 사용된다', async () => {
      mockPermissionService.getEffectiveInstructorId.mockResolvedValue(
        mockAssistants.basic.instructorId,
      );
      mockEnrollmentsRepo.findMany.mockResolvedValue({
        enrollments: [],
        totalCount: 0,
      });

      await enrollmentsService.getEnrollments(
        UserType.ASSISTANT,
        mockAssistants.basic.id,
        mockEnrollmentQueries.withPagination,
      );

      expect(
        mockPermissionService.getEffectiveInstructorId,
      ).toHaveBeenCalledWith(UserType.ASSISTANT, mockAssistants.basic.id);
      expect(mockEnrollmentsRepo.findMany).toHaveBeenCalledWith(
        mockAssistants.basic.instructorId,
        mockEnrollmentQueries.withPagination,
      );
    });

    it('존재하지 않는 조교 ID로 권한 검증을 시도할 때, NotFoundException을 던진다', async () => {
      mockPermissionService.getEffectiveInstructorId.mockRejectedValue(
        new NotFoundException('조교 정보를 찾을 수 없습니다.'),
      );

      await expect(
        enrollmentsService.getEnrollments(
          UserType.ASSISTANT,
          'invalid-assistant-id',
          mockEnrollmentQueries.withPagination,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('ENR-20: 권한 없는 userType', () => {
    it('강사/조교가 아닌 사용자가 강사 소속 정보 조회를 요청할 때, ForbiddenException을 던진다', async () => {
      mockPermissionService.getEffectiveInstructorId.mockRejectedValue(
        new ForbiddenException('강사 또는 조교만 접근 가능합니다.'),
      );

      await expect(
        enrollmentsService.getEnrollments(
          UserType.STUDENT,
          mockStudents.basic.id,
          mockEnrollmentQueries.withPagination,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
  describe('[수강 삭제] removeLectureEnrollment', () => {
    const lectureId = 'lecture-1';
    const enrollmentId = 'enrollment-1';
    const instructorId = 'instructor-1';

    it('성공: 수강 정보를 영구 삭제(Hard Delete)한다', async () => {
      mockLecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        status: LectureStatus.SCHEDULED,
        id: lectureId,
        instructorId,
      });
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        {
          id: 'le-1',
          lectureId,
          enrollmentId,
          registeredAt: new Date(),
          memo: null,
          enrollment: mockEnrollments.active,
        },
      );

      const result = await enrollmentsService.removeLectureEnrollment(
        lectureId,
        enrollmentId,
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(result).toEqual({ lectureId, enrollmentId });
      expect(
        mockLectureEnrollmentsRepo.removeByLectureIdAndEnrollmentId,
      ).toHaveBeenCalledWith(lectureId, enrollmentId);
    });

    it('실패: 강의가 존재하지 않으면 NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue(null);

      await expect(
        enrollmentsService.removeLectureEnrollment(
          lectureId,
          enrollmentId,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('실패: 수강 정보가 존재하지 않으면 NotFoundException을 던진다', async () => {
      mockLecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        id: lectureId,
        instructorId,
      });
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        null,
      );

      await expect(
        enrollmentsService.removeLectureEnrollment(
          lectureId,
          enrollmentId,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('실패: 이미 시작된 강의의 수강 정보인 경우 BadRequestException을 던진다', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockLecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        status: LectureStatus.IN_PROGRESS,
        startAt: pastDate,
        id: lectureId,
        instructorId,
      });
      mockPermissionService.validateInstructorAccess.mockResolvedValue();
      mockLectureEnrollmentsRepo.findByLectureIdAndEnrollmentId.mockResolvedValue(
        {
          id: 'le-1',
          lectureId,
          enrollmentId,
          registeredAt: new Date(),
          memo: null,
          enrollment:
            mockEnrollments.active as unknown as EnrollmentWithRelations,
        } as Awaited<
          ReturnType<
            LectureEnrollmentsRepository['findByLectureIdAndEnrollmentId']
          >
        >,
      );

      await expect(
        enrollmentsService.removeLectureEnrollment(
          lectureId,
          enrollmentId,
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
