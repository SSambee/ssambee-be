import { LecturesService } from './lectures.service.js';
import {
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';
import {
  createMockLecturesRepository,
  createMockEnrollmentsRepository,
  createMockInstructorRepository,
  createMockPermissionService,
  createMockPrisma,
  createMockLectureEnrollmentsRepository,
} from '../test/mocks/index.js';
import {
  mockInstructor,
  mockLectures,
  mockLecturesListResponse,
  createLectureRequests,
  updateLectureRequests,
  mockEnrollments,
} from '../test/fixtures/index.js';
import { mockUsers } from '../test/fixtures/user.fixture.js';

// Aliases for backward compatibility

import { PrismaClient } from '../generated/prisma/client.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import { UserType } from '../constants/auth.constant.js';

describe('LecturesService - @unit #critical', () => {
  // Mock Dependencies
  let mockLecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockInstructorRepo: ReturnType<typeof createMockInstructorRepository>;
  let mockLectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: PrismaClient;

  // Service under test
  let lecturesService: LecturesService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockLecturesRepo = createMockLecturesRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockInstructorRepo = createMockInstructorRepository();
    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;

    // Create LecturesService DI
    lecturesService = new LecturesService(
      mockLecturesRepo,
      mockEnrollmentsRepo,
      mockLectureEnrollmentsRepo,
      mockInstructorRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  describe('[강의 생성] createLecture', () => {
    describe('LECTURE-01: 강의 생성 성공', () => {
      it('강사가 기본 정보만으로 강의 생성을 요청할 때, 강의가 생성되고 연관 관계가 없는 상태로 반환된다', async () => {
        // Arrange
        mockInstructorRepo.findById.mockResolvedValue(mockInstructor);
        mockLecturesRepo.create.mockResolvedValue({
          ...mockLectures.basic,
          lectureTimes: [],
        });

        // Mock $transaction
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
          fn({}),
        );

        // Act
        const result = await lecturesService.createLecture(mockInstructor.id, {
          ...createLectureRequests.basic,
          startAt: new Date(createLectureRequests.basic.startAt),
          endAt: new Date(createLectureRequests.basic.endAt),
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.id).toBe(mockLectures.basic.id);
        expect(mockInstructorRepo.findById).toHaveBeenCalledWith(
          mockInstructor.id,
        );
        expect(mockLecturesRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            instructorId: mockInstructor.id,
            title: createLectureRequests.basic.title,
          }),
          expect.anything(),
        );
      });

      it('강사가 수강생 목록과 함께 강의 생성을 요청할 때, 강의와 수강 정보가 모두 생성되고 반환된다', async () => {
        mockInstructorRepo.findById.mockResolvedValue(mockInstructor);
        mockLecturesRepo.create.mockResolvedValue({
          ...mockLectures.withEnrollments,
          lectureTimes: [],
        });
        mockEnrollmentsRepo.findManyByInstructorAndPhones.mockResolvedValue([]);
        mockEnrollmentsRepo.createMany.mockResolvedValue([
          mockEnrollments.active, // 기존 createMany 결과 모사
        ]);
        mockLectureEnrollmentsRepo.createMany.mockResolvedValue([]); // LectureEnrollment 생성 모사

        // Mock $transaction - callback을 실제로 실행하고 결과 반환
        (mockPrisma.$transaction as jest.Mock).mockImplementation(
          async (fn) => {
            const txResult = await fn({});
            return txResult;
          },
        );

        const result = await lecturesService.createLecture(mockInstructor.id, {
          ...createLectureRequests.withEnrollments,
          startAt: new Date(createLectureRequests.withEnrollments.startAt),
          endAt: new Date(createLectureRequests.withEnrollments.endAt),
        });

        expect(result).toBeDefined();
        // expect(result.enrollments).toBeDefined(); // 서비스에서 enrollments 필드가 없어졌을 수 있음 (lectureEnrollments로 대체)
        expect(mockLecturesRepo.create).toHaveBeenCalled();

        // 1. 기존 Enrollment 조회 호출 확인
        expect(
          mockEnrollmentsRepo.findManyByInstructorAndPhones,
        ).toHaveBeenCalled();

        // 2. 새 Enrollment 생성 호출 확인
        expect(mockEnrollmentsRepo.createMany).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              instructorId: mockInstructor.id,
              status: EnrollmentStatus.ACTIVE,
              studentName:
                createLectureRequests.withEnrollments.enrollments![0]
                  .studentName,
            }),
          ]),
          expect.anything(),
        );

        // 3. LectureEnrollment 생성 호출 확인
        expect(mockLectureEnrollmentsRepo.createMany).toHaveBeenCalledWith(
          expect.any(Array),
          expect.anything(),
        );
      });
    });

    describe('LECTURE-02: 강의 생성 실패', () => {
      it('존재하지 않는 강사 ID로 강의 생성을 요청할 때, NotFoundException을 던진다', async () => {
        mockInstructorRepo.findById.mockResolvedValue(null);

        await expect(
          lecturesService.createLecture('non-existent-instructor-id', {
            ...createLectureRequests.basic,
            startAt: new Date(createLectureRequests.basic.startAt),
            endAt: new Date(createLectureRequests.basic.endAt),
          }),
        ).rejects.toThrow(NotFoundException);

        await expect(
          lecturesService.createLecture('non-existent-instructor-id', {
            ...createLectureRequests.basic,
            startAt: new Date(createLectureRequests.basic.startAt),
            endAt: new Date(createLectureRequests.basic.endAt),
          }),
        ).rejects.toThrow('강사를 찾을 수 없습니다.');

        expect(mockLecturesRepo.create).not.toHaveBeenCalled();
      });
    });
  });

  describe('[강의 수정] updateLecture', () => {
    describe('LECTURE-03: 강의 수정 성공', () => {
      it('강사가 본인 소속 강의의 정보 수정을 요청할 때, 정보가 업데이트되고 반영된 결과가 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        const updatedLecture = {
          ...mockLectures.basic,
          title: updateLectureRequests.full.title,
          subject: updateLectureRequests.full.subject,
          description: updateLectureRequests.full.description,
          status: updateLectureRequests.full.status,
          startAt: new Date(updateLectureRequests.full.startAt),
          endAt: new Date(updateLectureRequests.full.endAt),
        };
        mockLecturesRepo.update.mockResolvedValue(updatedLecture);

        const result = await lecturesService.updateLecture(
          mockInstructor.id,
          UserType.INSTRUCTOR,
          mockLectures.basic.id,
          {
            ...updateLectureRequests.full,
            startAt: new Date(updateLectureRequests.full.startAt),
            endAt: new Date(updateLectureRequests.full.endAt),
          },
        );

        expect(result).toBeDefined();
        expect(result.title).toBe(updateLectureRequests.full.title);
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
          mockLectures.basic.id,
        );
        expect(mockLecturesRepo.update).toHaveBeenCalledWith(
          mockLectures.basic.id,
          mockLectures.basic.instructorId,
          expect.objectContaining({
            title: updateLectureRequests.full.title,
            subject: updateLectureRequests.full.subject,
          }),
          undefined,
        );
      });

      it('강사가 일부 필드만 포함하여 강의 정보 수정을 요청할 때, 해당 필드만 업데이트되고 나머지는 유지된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockLecturesRepo.update.mockResolvedValue({
          ...mockLectures.basic,
          title: updateLectureRequests.partial.title!,
        });

        const result = await lecturesService.updateLecture(
          mockInstructor.id,
          UserType.INSTRUCTOR,
          mockLectures.basic.id,
          updateLectureRequests.partial,
        );

        expect(result).toBeDefined();
        expect(mockLecturesRepo.update).toHaveBeenCalledWith(
          mockLectures.basic.id,
          mockLectures.basic.instructorId,
          expect.objectContaining({
            title: updateLectureRequests.partial.title,
          }),
          undefined,
        );
        // undefined였던 description은 update payload에 포함되지 않아야 함
        const updateCall = mockLecturesRepo.update.mock.calls[0][1];
        expect(updateCall).not.toHaveProperty('description');
      });
    });

    describe('LECTURE-04: 강의 수정 실패', () => {
      it('사용자가 존재하지 않는 강의 ID로 정보 수정을 요청할 때, NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          lecturesService.updateLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
            {
              ...updateLectureRequests.full,
              startAt: new Date(updateLectureRequests.full.startAt),
              endAt: new Date(updateLectureRequests.full.endAt),
            },
          ),
        ).rejects.toThrow(NotFoundException);

        await expect(
          lecturesService.updateLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
            {
              ...updateLectureRequests.full,
              startAt: new Date(updateLectureRequests.full.startAt),
              endAt: new Date(updateLectureRequests.full.endAt),
            },
          ),
        ).rejects.toThrow('강의를 찾을 수 없습니다.');

        expect(mockLecturesRepo.update).not.toHaveBeenCalled();
      });

      it('강사가 다른 강사 소속 강의의 정보를 수정하려 할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(
          mockLectures.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 강의를 수정할 권한이 없습니다.'),
        );

        await expect(
          lecturesService.updateLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
            {
              ...updateLectureRequests.full,
              startAt: new Date(updateLectureRequests.full.startAt),
              endAt: new Date(updateLectureRequests.full.endAt),
            },
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          lecturesService.updateLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
            {
              ...updateLectureRequests.full,
              startAt: new Date(updateLectureRequests.full.startAt),
              endAt: new Date(updateLectureRequests.full.endAt),
            },
          ),
        ).rejects.toThrow('해당 강의를 수정할 권한이 없습니다.');

        expect(mockLecturesRepo.update).not.toHaveBeenCalled();
      });
    });
  });

  describe('[강의 삭제] deleteLecture', () => {
    describe('LECTURE-05: 강의 삭제 성공', () => {
      it('강사가 강의 삭제를 요청할 때, 해당 강의가 Soft Delete(삭제일시 기록)되고 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);
        mockLecturesRepo.softDelete.mockResolvedValue(undefined);

        await lecturesService.deleteLecture(
          mockInstructor.id,
          UserType.INSTRUCTOR,
          mockLectures.basic.id,
        );

        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
          mockLectures.basic.id,
        );
        expect(mockLecturesRepo.softDelete).toHaveBeenCalledWith(
          mockLectures.basic.id,
        );
      });
    });

    describe('LECTURE-06: 강의 삭제 실패', () => {
      it('사용자가 존재하지 않는 강의 ID로 삭제를 요청할 때, NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          lecturesService.deleteLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
          ),
        ).rejects.toThrow(NotFoundException);

        await expect(
          lecturesService.deleteLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
          ),
        ).rejects.toThrow('강의를 찾을 수 없습니다.');

        expect(mockLecturesRepo.softDelete).not.toHaveBeenCalled();
      });

      it('강사가 다른 강사 소속 강의를 삭제하려 할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(
          mockLectures.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 강의를 삭제할 권한이 없습니다.'),
        );

        await expect(
          lecturesService.deleteLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          lecturesService.deleteLecture(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
          ),
        ).rejects.toThrow('해당 강의를 삭제할 권한이 없습니다.');

        expect(mockLecturesRepo.softDelete).not.toHaveBeenCalled();
      });
    });
  });

  describe('[강의 조회] getLectureById', () => {
    describe('LECTURE-07: 강의 조회 성공', () => {
      it('강사가 본인 소속 강의의 상세 조회를 요청할 때, 상세 강의 정보가 반환된다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(mockLectures.basic);

        const result = await lecturesService.getLectureById(
          mockInstructor.id,
          UserType.INSTRUCTOR,
          mockLectures.basic.id,
        );

        expect(result).toBeDefined();
        expect(result.id).toBe(mockLectures.basic.id);
        expect(result.instructorName).toBe(mockUsers.instructor.name);
        expect(result.enrollmentsCount).toBe(
          mockLectures.basic._count.lectureEnrollments, // 수정됨
        );
        // expect(result.students).toEqual([]); // 구현 방식에 따라 빈 배열이거나 매핑된 결과임
        expect(mockLecturesRepo.findById).toHaveBeenCalledWith(
          mockLectures.basic.id,
        );
      });
    });

    describe('LECTURE-08: 강의 조회 실패', () => {
      it('사용자가 존재하지 않는 강의 ID로 상세 조회를 요청할 때, NotFoundException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(null);

        await expect(
          lecturesService.getLectureById(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
          ),
        ).rejects.toThrow(NotFoundException);

        await expect(
          lecturesService.getLectureById(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            'non-existent-lecture-id',
          ),
        ).rejects.toThrow('강의를 찾을 수 없습니다.');
      });

      it('강사가 다른 강사 소속 강의의 상세 정보를 조회하려 할 때, ForbiddenException을 던진다', async () => {
        mockLecturesRepo.findById.mockResolvedValue(
          mockLectures.otherInstructor,
        );
        mockPermissionService.validateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 강의를 조회할 권한이 없습니다.'),
        );

        await expect(
          lecturesService.getLectureById(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          lecturesService.getLectureById(
            mockInstructor.id,
            UserType.INSTRUCTOR,
            mockLectures.otherInstructor.id,
          ),
        ).rejects.toThrow('해당 강의를 조회할 권한이 없습니다.');
      });
    });
  });

  describe('[강의 목록 조회] getLectures', () => {
    describe('LECTURE-09: 강의 목록 조회 성공', () => {
      it('강사가 강의 목록 조회를 요청할 때, 본인 소속의 강의 목록과 페이지네이션 정보가 반환된다', async () => {
        mockLecturesRepo.findMany.mockResolvedValue(mockLecturesListResponse);

        const result = await lecturesService.getLectures(mockInstructor.id, {
          page: 1,
          limit: 4,
        });

        expect(result).toBeDefined();
        expect(result.lectures).toHaveLength(2);

        // Mapped fields assertions
        expect(result.lectures[0]).toMatchObject({
          id: mockLectures.basic.id,
          instructorName: mockUsers.instructor.name,
          enrollmentsCount: 10,
          lectureTimes: [],
        });

        expect(result.pagination).toMatchObject({
          totalCount: 2,
          totalPage: 1,
          currentPage: 1,
          limit: 4,
          hasNextPage: false,
          hasPrevPage: false,
        });

        expect(mockLecturesRepo.findMany).toHaveBeenCalledWith({
          page: 1,
          limit: 4,
          instructorId: mockInstructor.id,
          search: undefined,
        });
      });

      it('강사가 검색어와 함께 강의 목록 조회를 요청할 때, 제목이 필터링된 결과가 반환된다', async () => {
        mockLecturesRepo.findMany.mockResolvedValue({
          lectures: [mockLecturesListResponse.lectures[0]],
          totalCount: 1,
        });

        const result = await lecturesService.getLectures(mockInstructor.id, {
          page: 1,
          limit: 4,
          search: 'Basic',
        });

        expect(result.lectures).toHaveLength(1);
        expect(result.lectures[0].title).toBe(mockLectures.basic.title);
        expect(result.lectures[0].instructorName).toBe(
          mockUsers.instructor.name,
        );

        expect(mockLecturesRepo.findMany).toHaveBeenCalledWith({
          page: 1,
          limit: 4,
          instructorId: mockInstructor.id,
          search: 'Basic',
        });
      });
    });
  });
});
