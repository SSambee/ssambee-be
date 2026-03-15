import { PermissionService } from './permission.service.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { UserType } from '../constants/auth.constant.js';
import {
  createMockAssistantRepository,
  createMockParentChildLinkRepository,
} from '../test/mocks/index.js';
import {
  mockInstructor,
  mockAssistants,
  mockStudents,
  mockParents,
  mockParentLinks,
  mockEnrollments,
} from '../test/fixtures/index.js';
import type { Enrollment } from '../generated/prisma/client.js';

describe('PermissionService - @unit #critical', () => {
  // Mock Dependencies
  let mockAssistantRepo: ReturnType<typeof createMockAssistantRepository>;
  let mockParentChildLinkRepo: ReturnType<
    typeof createMockParentChildLinkRepository
  >;

  // Service under test
  let permissionService: PermissionService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockAssistantRepo = createMockAssistantRepository();
    mockParentChildLinkRepo = createMockParentChildLinkRepository();

    // Create PermissionService DI
    permissionService = new PermissionService(
      mockAssistantRepo,
      mockParentChildLinkRepo,
    );
  });

  describe('[강사 ID 추출] getEffectiveInstructorId', () => {
    const instructorId = mockInstructor.id;

    describe('PERM-01: 강사 ID 추출 성공', () => {
      it('강사(INSTRUCTOR)가 요청했을 때, 본인의 ID를 유효한 강사 ID로 반환해야 한다', async () => {
        // 실행
        const effectiveId = await permissionService.getEffectiveInstructorId(
          UserType.INSTRUCTOR,
          instructorId,
        );

        // 검증
        expect(effectiveId).toBe(instructorId);
      });

      it('조교(ASSISTANT)가 요청했을 때, 담당 강사의 ID를 유효한 강사 ID로 반환해야 한다', async () => {
        // 준비
        const assistantId = mockAssistants.basic.id;
        mockAssistantRepo.findById.mockResolvedValue(mockAssistants.basic);

        // 실행
        const effectiveId = await permissionService.getEffectiveInstructorId(
          UserType.ASSISTANT,
          assistantId,
        );

        // 검증
        expect(effectiveId).toBe(mockAssistants.basic.instructorId);
        expect(mockAssistantRepo.findById).toHaveBeenCalledWith(assistantId);
      });
    });

    describe('PERM-02: 강사 ID 추출 실패', () => {
      it('존재하지 않는 조교 ID로 요청했을 때, ForbiddenException을 던져야 한다', async () => {
        mockAssistantRepo.findById.mockResolvedValue(null);

        await expect(
          permissionService.getEffectiveInstructorId(
            UserType.ASSISTANT,
            'invalid-assistant-id',
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.getEffectiveInstructorId(
            UserType.ASSISTANT,
            'invalid-assistant-id',
          ),
        ).rejects.toThrow('조교 정보를 찾을 수 없습니다.');
      });

      it.each([UserType.STUDENT, UserType.PARENT] as UserType[])(
        '학생이나 학부모(%s)가 요청했을 때, ForbiddenException을 던져야 한다',
        async (userType: UserType) => {
          await expect(
            permissionService.getEffectiveInstructorId(userType, 'some-id'),
          ).rejects.toThrow(ForbiddenException);
          await expect(
            permissionService.getEffectiveInstructorId(userType, 'some-id'),
          ).rejects.toThrow('강사 또는 조교만 접근 가능합니다.');
        },
      );
    });
  });

  describe('[강사/조교 쓰기 권한] validateInstructorAccess', () => {
    const targetInstructorId = mockInstructor.id;

    describe('PERM-03: 쓰기 권한 검증 성공', () => {
      it('강사 본인이 자신의 리소스에 접근할 때, 성공적으로 완료되어야 한다', async () => {
        await expect(
          permissionService.validateInstructorAccess(
            targetInstructorId,
            UserType.INSTRUCTOR,
            targetInstructorId,
          ),
        ).resolves.toBeUndefined();
      });

      it('담당 조교가 강사의 리소스에 접근할 때, 성공적으로 완료되어야 한다', async () => {
        mockAssistantRepo.findById.mockResolvedValue(mockAssistants.basic); // 담당 강사 ID: targetInstructorId

        await expect(
          permissionService.validateInstructorAccess(
            targetInstructorId,
            UserType.ASSISTANT,
            mockAssistants.basic.id,
          ),
        ).resolves.toBeUndefined();
      });
    });

    describe('PERM-04: 쓰기 권한 검증 실패', () => {
      it('강사가 타인의 리소스에 접근할 때, ForbiddenException을 던져야 한다', async () => {
        const anotherInstructorId = 'another-instructor-id';

        await expect(
          permissionService.validateInstructorAccess(
            anotherInstructorId,
            UserType.INSTRUCTOR,
            targetInstructorId,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.validateInstructorAccess(
            anotherInstructorId,
            UserType.INSTRUCTOR,
            targetInstructorId,
          ),
        ).rejects.toThrow('해당 권한이 없습니다.');
      });

      it('조교가 담당 강사가 아닌 타인의 리소스에 접근할 때, ForbiddenException을 던져야 한다', async () => {
        mockAssistantRepo.findById.mockResolvedValue(
          mockAssistants.otherInstructor,
        ); // 담당 강사 ID: mockAssistants.otherInstructor.instructorId (타인)

        await expect(
          permissionService.validateInstructorAccess(
            targetInstructorId, // 타겟 리소스 ID는 mockInstructor.id
            UserType.ASSISTANT,
            mockAssistants.otherInstructor.id,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('[학생 본인 접근 권한] validateStudentAccess', () => {
    const studentId = mockStudents.basic.id;

    describe('PERM-05: 학생 접근 권한 검증 성공', () => {
      it('학생 본인이 자신의 ID로 접근할 때, 성공적으로 완료되어야 한다', async () => {
        await expect(
          permissionService.validateStudentAccess(studentId, studentId),
        ).resolves.toBeUndefined();
      });
    });

    describe('PERM-06: 학생 접근 권한 검증 실패', () => {
      it('학생이 타인의 ID로 접근할 때, ForbiddenException을 던져야 한다', async () => {
        const anotherStudentId = mockStudents.another.id;

        await expect(
          permissionService.validateStudentAccess(studentId, anotherStudentId),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.validateStudentAccess(studentId, anotherStudentId),
        ).rejects.toThrow('본인의 정보만 조회할 수 있습니다.');
      });
    });
  });

  describe('[자녀 접근 권한] validateChildAccess', () => {
    const parentId = mockParents.basic.id;
    const childLinkId = mockParentLinks.active.id;
    const childLink = mockParentLinks.active;

    describe('PERM-07: 자녀 접근 권한 검증 성공', () => {
      it('학부모(PARENT)가 본인의 자녀 링크에 접근할 때, 해당 자녀 링크 객체를 반환해야 한다', async () => {
        mockParentChildLinkRepo.findById.mockResolvedValue(childLink as never);

        const result = await permissionService.validateChildAccess(
          UserType.PARENT,
          parentId,
          childLinkId,
        );

        expect(result).toEqual(childLink);
        expect(mockParentChildLinkRepo.findById).toHaveBeenCalledWith(
          childLinkId,
        );
      });
    });

    describe('PERM-08: 자녀 접근 권한 검증 실패', () => {
      it.each([
        UserType.INSTRUCTOR,
        UserType.STUDENT,
        UserType.ASSISTANT,
      ] as UserType[])(
        '학부모가 아닌 사용자(%s)가 접근할 때, ForbiddenException을 던져야 한다',
        async (userType: UserType) => {
          await expect(
            permissionService.validateChildAccess(
              userType,
              parentId,
              childLinkId,
            ),
          ).rejects.toThrow(ForbiddenException);
          await expect(
            permissionService.validateChildAccess(
              userType,
              parentId,
              childLinkId,
            ),
          ).rejects.toThrow('접근 권한이 없습니다.');
        },
      );

      it('존재하지 않는 자녀 링크 ID로 접근할 때, NotFoundException을 던져야 한다', async () => {
        mockParentChildLinkRepo.findById.mockResolvedValue(null);

        await expect(
          permissionService.validateChildAccess(
            UserType.PARENT,
            parentId,
            'invalid-link-id',
          ),
        ).rejects.toThrow(NotFoundException);
        await expect(
          permissionService.validateChildAccess(
            UserType.PARENT,
            parentId,
            'invalid-link-id',
          ),
        ).rejects.toThrow('자녀 정보를 찾을 수 없습니다.');
      });

      it('다른 학부모의 자녀 링크 ID로 접근할 때, ForbiddenException을 던져야 한다', async () => {
        const anotherParentId = mockParents.another.id;
        const anotherChildLink = {
          ...childLink,
          appParentId: anotherParentId,
        };
        mockParentChildLinkRepo.findById.mockResolvedValue(
          anotherChildLink as never,
        );

        await expect(
          permissionService.validateChildAccess(
            UserType.PARENT,
            parentId, // 접근하려는 profileId
            childLinkId, // 조회하는 childLinkId
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.validateChildAccess(
            UserType.PARENT,
            parentId,
            childLinkId,
          ),
        ).rejects.toThrow('본인의 자녀만 조회할 수 있습니다.');
      });
    });
  });

  describe('[수강 정보 조회 권한] validateEnrollmentReadAccess', () => {
    const instructorId = mockInstructor.id;
    const studentId = mockStudents.basic.id;
    const parentId = mockParents.basic.id;

    // 강사/조교가 접근하는 수강 정보 (강사 소속)
    const instructorEnrollment = {
      ...mockEnrollments.active,
      instructorId: instructorId,
    } as Enrollment;

    // 학생이 접근하는 수강 정보 (본인 ID가 매핑됨)
    const studentEnrollment = {
      ...mockEnrollments.active,
      appStudentId: studentId,
      instructorId: 'another-instructor-id',
    } as Enrollment;

    // 학부모가 접근하는 수강 정보 (자녀 링크 ID가 매핑됨)
    const parentEnrollment = {
      ...mockEnrollments.active,
      appParentLinkId: mockParentLinks.active.id,
      instructorId: 'another-instructor-id',
      appStudentId: 'another-student-id',
    } as Enrollment;

    // mock internal dependencies
    let mockValidateInstructorAccess: jest.SpyInstance;
    let mockValidateStudentAccess: jest.SpyInstance;
    let mockValidateChildAccess: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();

      // permissionService 인스턴스가 최상위 beforeEach에서 생성된 후 스파이를 생성 및 할당
      mockValidateInstructorAccess = jest.spyOn(
        permissionService,
        'validateInstructorAccess' as never,
      );
      mockValidateStudentAccess = jest.spyOn(
        permissionService,
        'validateStudentAccess' as never,
      );
      mockValidateChildAccess = jest.spyOn(
        permissionService,
        'validateChildAccess' as never,
      );

      // 성공 케이스를 위해 mock 메서드의 구현을 기본적으로 성공으로 설정
      mockValidateInstructorAccess.mockResolvedValue(undefined);
      mockValidateStudentAccess.mockResolvedValue(undefined);
      mockValidateChildAccess.mockResolvedValue(
        mockParentLinks.active as never,
      );
    });

    describe('PERM-09: 강사/조교 권한 성공/실패', () => {
      it.each([UserType.INSTRUCTOR, UserType.ASSISTANT] as UserType[])(
        '강사 또는 조교(%s)가 자신의 강의 수강 정보에 접근할 때, validateInstructorAccess를 호출하며 성공해야 한다',
        async (userType: UserType) => {
          await expect(
            permissionService.validateEnrollmentReadAccess(
              instructorEnrollment,
              userType,
              instructorId,
            ),
          ).resolves.toBeUndefined();

          expect(mockValidateInstructorAccess).toHaveBeenCalledWith(
            instructorEnrollment.instructorId,
            userType,
            instructorId,
          );
        },
      );

      it('강사/조교가 권한 없는 강의 수강 정보에 접근할 때, validateInstructorAccess 실패로 인해 ForbiddenException을 던져야 한다', async () => {
        mockValidateInstructorAccess.mockRejectedValue(
          new ForbiddenException('해당 권한이 없습니다.'),
        );

        await expect(
          permissionService.validateEnrollmentReadAccess(
            instructorEnrollment,
            UserType.INSTRUCTOR,
            'another-profile-id',
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('PERM-10: 학생 권한 성공/실패', () => {
      it('학생(STUDENT)이 본인의 수강 정보에 접근할 때, validateStudentAccess를 호출하며 성공해야 한다', async () => {
        await expect(
          permissionService.validateEnrollmentReadAccess(
            studentEnrollment,
            UserType.STUDENT,
            studentId,
          ),
        ).resolves.toBeUndefined();

        expect(mockValidateStudentAccess).toHaveBeenCalledWith(
          studentId,
          studentEnrollment.appStudentId,
        );
      });

      it('학생이 타인의 수강 정보에 접근할 때, validateStudentAccess 실패로 ForbiddenException을 던져야 한다', async () => {
        mockValidateStudentAccess.mockRejectedValue(
          new ForbiddenException('본인의 정보만 조회할 수 있습니다.'),
        );
        const anotherStudentEnrollment = {
          ...studentEnrollment,
          appStudentId: mockStudents.another.id,
        } as Enrollment;

        await expect(
          permissionService.validateEnrollmentReadAccess(
            anotherStudentEnrollment,
            UserType.STUDENT,
            studentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('PERM-11: 학부모 권한 성공/실패', () => {
      it('학부모(PARENT)가 연결된 자녀의 수강 정보에 접근할 때, validateChildAccess를 호출하며 성공해야 한다', async () => {
        await expect(
          permissionService.validateEnrollmentReadAccess(
            parentEnrollment,
            UserType.PARENT,
            parentId,
          ),
        ).resolves.toBeUndefined();

        // 검증
        expect(mockValidateChildAccess).toHaveBeenCalledWith(
          UserType.PARENT,
          parentId,
          parentEnrollment.appParentLinkId,
        );
      });

      it('학부모가 appParentLinkId가 null인 수강 정보에 접근할 때, ForbiddenException을 던져야 한다', async () => {
        const enrollmentWithoutLink = {
          ...parentEnrollment,
          appParentLinkId: null,
        } as Enrollment;

        await expect(
          permissionService.validateEnrollmentReadAccess(
            enrollmentWithoutLink,
            UserType.PARENT,
            parentId,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.validateEnrollmentReadAccess(
            enrollmentWithoutLink,
            UserType.PARENT,
            parentId,
          ),
        ).rejects.toThrow('연결된 자녀 정보가 없습니다.');
        expect(mockValidateChildAccess).not.toHaveBeenCalled();
      });

      it('학부모가 타인의 자녀 수강 정보에 접근할 때, validateChildAccess 실패로 ForbiddenException을 던져야 한다', async () => {
        mockValidateChildAccess.mockRejectedValue(
          new ForbiddenException('본인의 자녀만 조회할 수 있습니다.'),
        );

        await expect(
          permissionService.validateEnrollmentReadAccess(
            parentEnrollment,
            UserType.PARENT,
            parentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('PERM-12: 기타 권한 실패', () => {
      it('유효하지 않은 UserType으로 접근할 때, ForbiddenException을 던져야 한다', async () => {
        await expect(
          permissionService.validateEnrollmentReadAccess(
            instructorEnrollment,
            'INVALID_USER_TYPE' as UserType,
            'some-id',
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          permissionService.validateEnrollmentReadAccess(
            instructorEnrollment,
            'INVALID_USER_TYPE' as UserType,
            'some-id',
          ),
        ).rejects.toThrow('접근 권한이 없습니다.');
      });
    });
  });
});
