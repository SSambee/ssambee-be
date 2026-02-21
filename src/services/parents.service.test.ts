import { ParentsService } from './parents.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '../err/http.exception.js';
import {
  createMockParentRepository,
  createMockParentChildLinkRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockPrisma,
  createMockPermissionService,
} from '../test/mocks/index.js';
import { mockParents, mockParentLinks } from '../test/fixtures/index.js';
import { PrismaClient } from '../generated/prisma/client.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

type LectureEnrollmentDetail = NonNullable<
  Awaited<ReturnType<LectureEnrollmentsRepository['findByIdWithDetails']>>
>;

describe('ParentsService - @unit #critical', () => {
  // Mock Dependencies
  let mockParentRepo: ReturnType<typeof createMockParentRepository>;
  let mockParentChildLinkRepo: ReturnType<
    typeof createMockParentChildLinkRepository
  >;
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockLectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let mockPermissionService: ReturnType<typeof createMockPermissionService>;
  let mockPrisma: PrismaClient;

  // Service under test
  let parentsService: ParentsService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockParentRepo = createMockParentRepository();
    mockParentChildLinkRepo = createMockParentChildLinkRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockLectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    mockPermissionService = createMockPermissionService();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;

    // Create ParentsService DI
    parentsService = new ParentsService(
      mockParentRepo,
      mockParentChildLinkRepo,
      mockEnrollmentsRepo,
      mockLectureEnrollmentsRepo,
      mockPermissionService,
      mockPrisma,
    );
  });

  /** [자녀 등록] registerChild 테스트 케이스 */
  describe('[자녀 등록] registerChild', () => {
    const parentId = mockParents.basic.id;
    const childData = {
      name: '김철수',
      phoneNumber: '010-1111-2222',
    };

    describe('PAR-01: 자녀 등록 성공', () => {
      it('학부모가 신규 자녀를 등록할 때, 자녀 정보가 생성되고 기존 수강 내역이 자동으로 연결된다', async () => {
        // 준비
        mockParentChildLinkRepo.findByParentIdAndPhoneNumber.mockResolvedValue(
          null,
        );
        mockParentChildLinkRepo.create.mockResolvedValue(
          mockParentLinks.active,
        );
        mockEnrollmentsRepo.updateAppParentLinkIdByStudentPhone.mockResolvedValue(
          { count: 2 },
        );

        // Mock $transaction
        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
          fn(mockPrisma),
        );

        // 실행
        const result = await parentsService.registerChild(
          UserType.PARENT,
          parentId,
          childData,
        );

        // 검증
        expect(result).toBeDefined();
        expect(result.id).toBe(mockParentLinks.active.id);
        expect(
          mockParentChildLinkRepo.findByParentIdAndPhoneNumber,
        ).toHaveBeenCalledWith(parentId, childData.phoneNumber);
        expect(mockParentChildLinkRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            appParentId: parentId,
            name: childData.name,
            phoneNumber: childData.phoneNumber,
          }),
          expect.anything(),
        );
        expect(
          mockEnrollmentsRepo.updateAppParentLinkIdByStudentPhone,
        ).toHaveBeenCalledWith(
          childData.phoneNumber,
          mockParentLinks.active.id,
          expect.anything(),
        );
      });

      it('학부모가 자녀를 등록할 때, 등록 과정의 모든 처리가 트랜잭션 내에서 수행된다', async () => {
        mockParentChildLinkRepo.findByParentIdAndPhoneNumber.mockResolvedValue(
          null,
        );
        mockParentChildLinkRepo.create.mockResolvedValue(
          mockParentLinks.active,
        );

        let transactionCalled = false;
        (mockPrisma.$transaction as jest.Mock).mockImplementation(
          async (fn) => {
            transactionCalled = true;
            return await fn(mockPrisma);
          },
        );

        await parentsService.registerChild(
          UserType.PARENT,
          parentId,
          childData,
        );

        expect(transactionCalled).toBe(true);
        expect(mockPrisma.$transaction).toHaveBeenCalled();
      });
    });

    describe('PAR-02: 자녀 등록 실패 - 권한 검증', () => {
      it('학부모 권한이 없는 사용자가 자녀를 등록하려 할 때, ForbiddenException을 던진다', async () => {
        await expect(
          parentsService.registerChild(
            UserType.STUDENT,
            'student-id',
            childData,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          parentsService.registerChild(
            UserType.STUDENT,
            'student-id',
            childData,
          ),
        ).rejects.toThrow('학부모만 자녀를 등록할 수 있습니다.');
      });

      it('강사가 자녀를 등록하려 할 때, ForbiddenException을 던진다', async () => {
        await expect(
          parentsService.registerChild(
            UserType.INSTRUCTOR,
            'instructor-id',
            childData,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('PAR-03: 자녀 등록 실패 - 중복 검증', () => {
      it('학부모가 이미 등록된 자녀 번호로 등록을 시도할 때, BadRequestException을 던진다', async () => {
        mockParentChildLinkRepo.findByParentIdAndPhoneNumber.mockResolvedValue(
          mockParentLinks.active,
        );

        await expect(
          parentsService.registerChild(UserType.PARENT, parentId, childData),
        ).rejects.toThrow(BadRequestException);

        await expect(
          parentsService.registerChild(UserType.PARENT, parentId, childData),
        ).rejects.toThrow('이미 등록된 자녀 번호입니다.');
      });
    });
  });

  describe('[자녀 목록 조회] getChildren', () => {
    const parentId = mockParents.basic.id;

    describe('PAR-04: 자녀 목록 조회 성공', () => {
      it('학부모가 자녀 목록 조회를 요청할 때, 등록된 모든 자녀 목록이 반환된다', async () => {
        const childrenList = [mockParentLinks.active, mockParentLinks.another];
        mockParentChildLinkRepo.findByAppParentId.mockResolvedValue(
          childrenList,
        );

        const result = await parentsService.getChildren(
          UserType.PARENT,
          parentId,
        );

        expect(result).toEqual(childrenList);
        expect(result).toHaveLength(2);
        expect(mockParentChildLinkRepo.findByAppParentId).toHaveBeenCalledWith(
          parentId,
        );
      });

      it('등록된 자녀가 없는 학부모가 목록 조회를 요청할 때, 빈 배열이 반환된다', async () => {
        mockParentChildLinkRepo.findByAppParentId.mockResolvedValue([]);

        const result = await parentsService.getChildren(
          UserType.PARENT,
          parentId,
        );

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
      });
    });

    describe('PAR-05: 자녀 목록 조회 실패', () => {
      it('학부모 권한이 없는 사용자가 자녀 목록을 조회하려 할 때, ForbiddenException을 던진다', async () => {
        await expect(
          parentsService.getChildren(UserType.STUDENT, 'student-id'),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          parentsService.getChildren(UserType.STUDENT, 'student-id'),
        ).rejects.toThrow('학부모만 자녀 목록을 조회할 수 있습니다.');
      });

      it('강사가 자녀 목록을 조회하려 할 때, ForbiddenException을 던진다', async () => {
        await expect(
          parentsService.getChildren(UserType.INSTRUCTOR, 'instructor-id'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('[자녀 수강 목록 조회] getChildEnrollments', () => {
    const parentId = mockParents.basic.id;
    const childLinkId = mockParentLinks.active.id;

    describe('PAR-06: 강사 목록 조회 성공 (EnrollmentCentric)', () => {
      it('학부모가 본인 자녀의 강사 목록 조회를 요청할 때, Enrollment 배열이 반환된다 (memo 제외)', async () => {
        mockPermissionService.validateChildAccess.mockResolvedValue(
          mockParentLinks.active,
        );

        const mockEnrollmentList = [
          {
            id: 'e-1',
            studentName: 'Kim',
            memo: 'secret',
            instructor: { user: { name: 'Teacher' } },
          },
        ];

        mockEnrollmentsRepo.findByAppParentLinkId.mockResolvedValue({
          enrollments: mockEnrollmentList,
          totalCount: 1,
        });

        const result = await parentsService.getChildEnrollments(
          UserType.PARENT,
          parentId,
          childLinkId,
        );

        expect(result).toBeDefined();
        expect(result.enrollments).toHaveLength(1);
        expect(result.enrollments[0]).not.toHaveProperty('memo');
        expect(result.totalCount).toBe(1);
        expect(mockPermissionService.validateChildAccess).toHaveBeenCalledWith(
          UserType.PARENT,
          parentId,
          childLinkId,
        );
        expect(mockEnrollmentsRepo.findByAppParentLinkId).toHaveBeenCalledWith(
          childLinkId,
          { page: 1, limit: 20 },
        );
      });
    });

    describe('getChildEnrollmentLectures: 자녀의 강사별 강의 목록 조회', () => {
      it('학부모가 자녀의 특정 강사 강의 목록을 요청할 때, 강의 목록이 반환된다', async () => {
        const enrollmentId = 'e-123';
        mockPermissionService.validateChildAccess.mockResolvedValue(
          mockParentLinks.active,
        );
        mockEnrollmentsRepo.findById.mockResolvedValue({
          id: enrollmentId,
          appParentLinkId: childLinkId,
        });
        const mockLectureEnrollments = [{ id: 'le-1' }];
        mockLectureEnrollmentsRepo.findManyByEnrollmentId.mockResolvedValue(
          mockLectureEnrollments,
        );

        const result = await parentsService.getChildEnrollmentLectures(
          UserType.PARENT,
          parentId,
          childLinkId,
          enrollmentId,
        );

        expect(result.lectureEnrollments).toEqual(mockLectureEnrollments);
        expect(
          mockLectureEnrollmentsRepo.findManyByEnrollmentId,
        ).toHaveBeenCalledWith(enrollmentId);
      });

      it('자녀의 정보가 아닌 Enrollment에 접근하려 할 때 ForbiddenException을 던진다', async () => {
        const enrollmentId = 'e-123';
        mockPermissionService.validateChildAccess.mockResolvedValue(
          mockParentLinks.active,
        );
        mockEnrollmentsRepo.findById.mockResolvedValue({
          id: enrollmentId,
          appParentLinkId: 'another-child-link',
        });

        await expect(
          parentsService.getChildEnrollmentLectures(
            UserType.PARENT,
            parentId,
            childLinkId,
            enrollmentId,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('PAR-07: 수강 목록 조회 실패', () => {
      it('학부모가 다른 학부모의 자녀 수강 목록을 조회하려 할 때, ForbiddenException을 던진다', async () => {
        mockPermissionService.validateChildAccess.mockRejectedValue(
          new ForbiddenException('본인의 자녀만 조회할 수 있습니다.'),
        );

        await expect(
          parentsService.getChildEnrollments(
            UserType.PARENT,
            parentId,
            childLinkId,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          parentsService.getChildEnrollments(
            UserType.PARENT,
            parentId,
            childLinkId,
          ),
        ).rejects.toThrow('본인의 자녀만 조회할 수 있습니다.');
      });

      it('학부모가 존재하지 않는 자녀 ID로 수강 목록을 조회하려 할 때, NotFoundException을 던진다', async () => {
        mockPermissionService.validateChildAccess.mockRejectedValue(
          new NotFoundException('자녀 정보를 찾을 수 없습니다.'),
        );

        await expect(
          parentsService.getChildEnrollments(
            UserType.PARENT,
            parentId,
            'invalid-child-id',
          ),
        ).rejects.toThrow(NotFoundException);

        await expect(
          parentsService.getChildEnrollments(
            UserType.PARENT,
            parentId,
            'invalid-child-id',
          ),
        ).rejects.toThrow('자녀 정보를 찾을 수 없습니다.');
      });

      it('학부모 권한이 없는 사용자가 자녀 수강 목록을 조회하려 할 때, ForbiddenException을 던진다', async () => {
        mockPermissionService.validateChildAccess.mockRejectedValue(
          new ForbiddenException('접근 권한이 없습니다.'),
        );

        await expect(
          parentsService.getChildEnrollments(
            UserType.STUDENT,
            'student-id',
            childLinkId,
          ),
        ).rejects.toThrow('접근 권한이 없습니다.');
      });
    });

    describe('[자녀 수강 상세 조회] getChildEnrollmentDetail (LectureCentric)', () => {
      const parentId = mockParents.basic.id;
      const childLinkId = mockParentLinks.active.id;
      const lectureEnrollmentId = 'le-123';

      const mockLectureEnrollment = {
        id: lectureEnrollmentId,
        lectureId: 'lecture-1',
        enrollmentId: 'enrollment-1',
        enrollment: {
          appParentLinkId: childLinkId,
        },
      };

      describe('PAR-08: 수강 상세 조회 성공', () => {
        it('학부모가 본인 자녀의 수강 상세 정보 조회를 요청할 때, 상세 수강 정보가 반환된다', async () => {
          mockPermissionService.validateChildAccess.mockResolvedValue(
            mockParentLinks.active,
          );
          mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
            mockLectureEnrollment as unknown as LectureEnrollmentDetail,
          );

          const result = await parentsService.getChildEnrollmentDetail(
            UserType.PARENT,
            parentId,
            childLinkId,
            lectureEnrollmentId,
          );

          expect(result).toBeDefined();
          expect(result.id).toBe(lectureEnrollmentId);
          expect(
            mockPermissionService.validateChildAccess,
          ).toHaveBeenCalledWith(UserType.PARENT, parentId, childLinkId);
          expect(
            mockLectureEnrollmentsRepo.findByIdWithDetails,
          ).toHaveBeenCalledWith(lectureEnrollmentId);
        });
      });

      describe('PAR-09: 수강 상세 조회 실패', () => {
        it('학부모가 다른 학부모의 자녀 수강 상세 정보를 조회하려 할 때, ForbiddenException을 던진다', async () => {
          mockPermissionService.validateChildAccess.mockRejectedValue(
            new ForbiddenException('본인의 자녀만 조회할 수 있습니다.'),
          );

          await expect(
            parentsService.getChildEnrollmentDetail(
              UserType.PARENT,
              parentId,
              childLinkId,
              lectureEnrollmentId,
            ),
          ).rejects.toThrow(ForbiddenException);
        });

        it('학부모가 존재하지 않는 수강 ID로 상세 조회를 요청할 때, NotFoundException을 던진다', async () => {
          mockPermissionService.validateChildAccess.mockResolvedValue(
            mockParentLinks.active,
          );
          mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
            null,
          );

          await expect(
            parentsService.getChildEnrollmentDetail(
              UserType.PARENT,
              parentId,
              childLinkId,
              'invalid-id',
            ),
          ).rejects.toThrow(NotFoundException);
        });

        it('학부모가 본인 자녀의 것이 아닌 수강 정보를 조회하려 할 때(appParentLinkId 불일치), ForbiddenException을 던진다', async () => {
          mockPermissionService.validateChildAccess.mockResolvedValue(
            mockParentLinks.active,
          );
          const differentEnrollment = {
            ...mockLectureEnrollment,
            enrollment: {
              appParentLinkId: 'different-link-id',
            },
          };
          mockLectureEnrollmentsRepo.findByIdWithDetails.mockResolvedValue(
            differentEnrollment as unknown as LectureEnrollmentDetail,
          );

          await expect(
            parentsService.getChildEnrollmentDetail(
              UserType.PARENT,
              parentId,
              childLinkId,
              lectureEnrollmentId,
            ),
          ).rejects.toThrow(ForbiddenException);
        });
      });

      describe('[Helper 함수] validateChildAccess', () => {
        const parentId = mockParents.basic.id;
        const childLinkId = mockParentLinks.active.id;

        describe('PAR-10: 자녀 접근 권한 검증 성공', () => {
          it('권한이 있는 학부모가 자녀 정보 조회를 요청할 때, 접근 권한 검증이 성공한다', async () => {
            mockPermissionService.validateChildAccess.mockResolvedValue(
              mockParentLinks.active,
            );
            mockEnrollmentsRepo.findByAppParentLinkId.mockResolvedValue({
              enrollments: [],
              totalCount: 0,
            });

            await expect(
              parentsService.getChildEnrollments(
                UserType.PARENT,
                parentId,
                childLinkId,
              ),
            ).resolves.toBeDefined();

            expect(
              mockPermissionService.validateChildAccess,
            ).toHaveBeenCalledWith(UserType.PARENT, parentId, childLinkId);
          });
        });

        describe('PAR-11: 자녀 접근 권한 검증 실패', () => {
          it('학부모가 아닌 사용자가 자녀 접근 권한 검증을 거칠 때, ForbiddenException을 던진다', async () => {
            mockPermissionService.validateChildAccess.mockRejectedValue(
              new ForbiddenException('접근 권한이 없습니다.'),
            );

            await expect(
              parentsService.getChildEnrollments(
                UserType.STUDENT,
                'student-id',
                childLinkId,
              ),
            ).rejects.toThrow(ForbiddenException);
          });

          it('존재하지 않는 자녀 ID에 대해 접근 권한 검증을 시도할 때, NotFoundException을 던진다', async () => {
            mockPermissionService.validateChildAccess.mockRejectedValue(
              new NotFoundException('자녀 정보를 찾을 수 없습니다.'),
            );

            await expect(
              parentsService.getChildEnrollments(
                UserType.PARENT,
                parentId,
                'invalid-child-id',
              ),
            ).rejects.toThrow(NotFoundException);
          });

          it('학부모가 다른 사람의 자녀에 대해 접근 권한 검증을 시도할 때, ForbiddenException을 던진다', async () => {
            mockPermissionService.validateChildAccess.mockRejectedValue(
              new ForbiddenException('본인의 자녀만 조회할 수 있습니다.'),
            );

            await expect(
              parentsService.getChildEnrollments(
                UserType.PARENT,
                parentId,
                childLinkId,
              ),
            ).rejects.toThrow(ForbiddenException);

            await expect(
              parentsService.getChildEnrollments(
                UserType.PARENT,
                parentId,
                childLinkId,
              ),
            ).rejects.toThrow('본인의 자녀만 조회할 수 있습니다.');
          });
        });
      });
    });
  });
});
