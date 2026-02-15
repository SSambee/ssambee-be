import { InstructorPostsService } from './instructor-posts.service.js';
import {
  createMockInstructorPostsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
  createMockMaterialsRepository,
  createMockEnrollmentsRepository,
  createMockStudentPostsRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { UserType } from '../constants/auth.constant.js';
import { PostScope, PostType } from '../constants/posts.constant.js';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { mockInstructorPosts } from '../test/fixtures/posts.fixture.js';
import {
  mockLectures,
  mockInstructor,
} from '../test/fixtures/lectures.fixture.js';
import { mockMaterials } from '../test/fixtures/materials.fixture.js';
import type {
  InstructorPostsRepository,
  InstructorPostWithDetails,
} from '../repos/instructor-posts.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { MaterialsRepository } from '../repos/materials.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { StudentPostsRepository } from '../repos/student-posts.repo.js';
import type { PermissionService } from './permission.service.js';
import type { Prisma } from '../generated/prisma/client.js';

/** 타입 정의 */
type MockLectureEnrollment = {
  enrollmentId: string;
  lectureId: string;
  lecture: { instructorId: string };
};

type MockMaterial = {
  id: string;
  instructorId: string;
};

describe('InstructorPostsService', () => {
  let service: InstructorPostsService;
  let instructorPostsRepo: jest.Mocked<InstructorPostsRepository>;
  let lecturesRepo: jest.Mocked<LecturesRepository>;
  let materialsRepo: jest.Mocked<MaterialsRepository>;
  let lectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let enrollmentsRepo: jest.Mocked<EnrollmentsRepository>;
  let studentPostsRepo: jest.Mocked<StudentPostsRepository>;
  let permissionService: jest.Mocked<PermissionService>;

  beforeEach(() => {
    instructorPostsRepo = createMockInstructorPostsRepository();
    lecturesRepo = createMockLecturesRepository();
    materialsRepo = createMockMaterialsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    studentPostsRepo = createMockStudentPostsRepository();
    permissionService = createMockPermissionService();

    service = new InstructorPostsService(
      instructorPostsRepo,
      lecturesRepo,
      materialsRepo,
      lectureEnrollmentsRepo,
      enrollmentsRepo,
      permissionService,
      studentPostsRepo,
    );

    studentPostsRepo.getStats.mockResolvedValue({
      totalCount: 0,
      thisMonthCount: 0,
      lastMonthCount: 0,
      unansweredCount: 0,
      processingCount: 0,
      answeredThisMonthCount: 0,
      unansweredCriteria: 0,
    });
  });

  describe('getPostTargets', () => {
    it('강사가 호출하면 본인의 모든 강의와 학생 목록을 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      lecturesRepo.findMany.mockResolvedValue({
        lectures: [mockLectures.basic],
        totalCount: 1,
      });
      lectureEnrollmentsRepo.findManyByLectureIdWithEnrollments.mockResolvedValue(
        [
          {
            enrollmentId: 'en-1',
            lectureId: mockLectures.basic.id,
            registeredAt: new Date(),
            memo: null,
            enrollment: {
              id: 'en-1',
              appStudentId: 'student-1',
              studentName: '김학생',
              studentPhone: '010-1234-5678',
              school: '서울고',
              schoolYear: '2',
            },
          },
        ],
      );

      const result = await service.getPostTargets(
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(result.totalLectures).toBe(1);
      expect(result.totalStudents).toBe(1);
      expect(result.lectures[0].lectureId).toBe(mockLectures.basic.id);
    });

    it('조교가 호출하면 담당 강사의 강의와 학생 목록을 반환한다', async () => {
      const assistantId = 'assistant-1';
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      lecturesRepo.findMany.mockResolvedValue({ lectures: [], totalCount: 0 });

      await service.getPostTargets(UserType.ASSISTANT, assistantId);

      expect(permissionService.getEffectiveInstructorId).toHaveBeenCalledWith(
        UserType.ASSISTANT,
        assistantId,
      );
    });

    it('강사 ID를 찾을 수 없으면 ForbiddenException이 발생한다', async () => {
      permissionService.getEffectiveInstructorId.mockResolvedValue(null);

      await expect(
        service.getPostTargets(UserType.ASSISTANT, 'assistant-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createPost', () => {
    it('강사 또는 조교가 아닌 사용자가 호출하면 ForbiddenException이 발생한다', async () => {
      permissionService.getEffectiveInstructorId.mockResolvedValue(null);

      await expect(
        service.createPost(
          { title: 'test', content: 'test', scope: PostScope.GLOBAL },
          'student-1',
          UserType.STUDENT,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 호출할 때 담당 강사 정보를 찾을 수 없으면 ForbiddenException이 발생한다', async () => {
      permissionService.getEffectiveInstructorId.mockResolvedValue(null);

      await expect(
        service.createPost(
          { title: 'test', content: 'test', scope: PostScope.GLOBAL },
          'assistant-1',
          UserType.ASSISTANT,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 존재하지 않으면 NotFoundException이 발생한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      lecturesRepo.findById.mockResolvedValue(null);

      await expect(
        service.createPost(
          {
            title: 'test',
            content: 'test',
            scope: PostScope.LECTURE,
            lectureId: 'invalid-lecture-id',
          },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('강의 공지(LECTURE) 생성 시 해당 강의의 담당 강사가 아니면 ForbiddenException이 발생한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      lecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        instructorId: 'other-instructor',
      });

      await expect(
        service.createPost(
          {
            title: 'test',
            content: 'test',
            scope: PostScope.LECTURE,
            lectureId: mockLectures.basic.id,
          },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 누락되면 BadRequestException이 발생한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.createPost(
          { title: 'test', content: 'test', scope: PostScope.LECTURE },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('선택 공지(SELECTED) 생성 시 타겟 학생이 지정되지 않으면 BadRequestException이 발생한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.createPost(
          {
            title: 'test',
            content: 'test',
            scope: PostScope.SELECTED,
            targetEnrollmentIds: [],
          },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    describe('자료 소유권 검증 (validateMaterialOwnership)', () => {
      it('첨부하려는 자료 중 일부가 존재하지 않으면 NotFoundException이 발생한다', async () => {
        const instructorId = mockInstructor.id;
        permissionService.getEffectiveInstructorId.mockResolvedValue(
          instructorId,
        );
        materialsRepo.findByIds.mockResolvedValue([]); // 자료 없음

        await expect(
          service.createPost(
            {
              title: 'test',
              content: 'test',
              scope: PostScope.GLOBAL,
              materialIds: ['non-existent-material'],
            },
            instructorId,
            UserType.INSTRUCTOR,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('다른 강사의 라이브러리 자료를 첨부하려고 하면 ForbiddenException이 발생한다', async () => {
        const instructorId = mockInstructor.id;
        permissionService.getEffectiveInstructorId.mockResolvedValue(
          instructorId,
        );
        materialsRepo.findByIds.mockResolvedValue([
          { ...mockMaterials.basic, instructorId: 'other-instructor' },
        ]);

        await expect(
          service.createPost(
            {
              title: 'test',
              content: 'test',
              scope: PostScope.GLOBAL,
              materialIds: [mockMaterials.basic.id],
            },
            instructorId,
            UserType.INSTRUCTOR,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    it('모든 유효성 검사를 통과하면 게시글을 생성하고 상세 정보를 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.create.mockResolvedValue(mockInstructorPosts.global);

      const result = await service.createPost(
        {
          title: '전체 공지사항',
          content: '모든 학생에게 보이는 공지입니다.',
          scope: PostScope.GLOBAL,
        },
        instructorId,
        UserType.INSTRUCTOR,
      );

      expect(instructorPostsRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockInstructorPosts.global);
    });
  });

  describe('getPostList', () => {
    it('강사가 조회하면 본인의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10 },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(permissionService.getEffectiveInstructorId).toHaveBeenCalledWith(
        UserType.INSTRUCTOR,
        instructorId,
      );
      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ instructorId }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('조교가 조회하면 담당 강사의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      const assistantId = 'assistant-1';
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      await service.getPostList(
        { page: 1, limit: 10 },
        UserType.ASSISTANT,
        assistantId,
      );

      expect(permissionService.getEffectiveInstructorId).toHaveBeenCalledWith(
        UserType.ASSISTANT,
        assistantId,
      );
      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ instructorId }),
      );
    });

    it('학생이 조회할 때 본인의 수강 정보를 기반으로 DB 필터링을 수행한다', async () => {
      const query = { page: 1, limit: 10 };
      const profileId = 'student-1';
      const mockEnrollments: MockLectureEnrollment[] = [
        {
          enrollmentId: 'en-1',
          lectureId: 'lec-1',
          lecture: { instructorId: 'ins-1' },
        },
      ];

      lectureEnrollmentsRepo.findAllByAppStudentId.mockResolvedValue(
        mockEnrollments as Prisma.LectureEnrollmentGetPayload<{
          include: { lecture: true };
        }>[],
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      const result = await service.getPostList(
        query,
        UserType.STUDENT,
        profileId,
      );

      expect(lectureEnrollmentsRepo.findAllByAppStudentId).toHaveBeenCalledWith(
        profileId,
      );
      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          studentFiltering: {
            lectureIds: ['lec-1'],
            instructorIds: ['ins-1'],
            enrollmentIds: ['en-1'],
          },
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('검색어, 페이지네이션 필터가 포함된 경우 정상적으로 목록을 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 5, search: '공지', scope: PostScope.GLOBAL },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          search: '공지',
          scope: PostScope.GLOBAL,
          page: 1,
          limit: 5,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('postType이 NOTICE인 경우 공지 게시글만 필터링하여 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, postType: PostType.NOTICE },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: PostType.NOTICE,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('postType이 SHARE인 경우 자료 공유 게시글만 필터링하여 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [],
        totalCount: 0,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, postType: PostType.SHARE },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          postType: PostType.SHARE,
        }),
      );
      expect(result.totalCount).toBe(0);
    });

    it('모든 필터링 파라미터가 포함된 경우 정상적으로 목록을 반환한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [mockInstructorPosts.global],
        totalCount: 1,
      });

      const result = await service.getPostList(
        {
          page: 2,
          limit: 5,
          search: '검색어',
          scope: PostScope.GLOBAL,
          postType: PostType.NOTICE,
          lectureId: mockLectures.basic.id,
        },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(instructorPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 5,
          search: '검색어',
          scope: PostScope.GLOBAL,
          postType: PostType.NOTICE,
          lectureId: mockLectures.basic.id,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('강사 또는 조교가 조회할 경우 통계 정보가 포맷팅되어 반환되어야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      studentPostsRepo.getStats.mockResolvedValue({
        totalCount: 100,
        thisMonthCount: 10,
        lastMonthCount: 5,
        unansweredCount: 2,
        processingCount: 3,
        answeredThisMonthCount: 1,
        unansweredCriteria: 1,
      });

      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [],
        totalCount: 0,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10 },
        UserType.INSTRUCTOR,
        instructorId,
      );

      expect(result.stats).toEqual({
        totalCount: 100,
        increaseRate: '100%',
        unansweredCount: 2,
        unansweredCriteria: 1,
        processingCount: 3,
        answeredThisMonthCount: 1,
      });
    });
  });

  describe('getPostDetail', () => {
    it('postId에 해당하는 게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      instructorPostsRepo.findById.mockResolvedValue(null);
      await expect(
        service.getPostDetail(
          'invalid-id',
          UserType.INSTRUCTOR,
          'instructor-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('강사가 본인의 것이 아닌 게시글을 상세 조회하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        instructorId: 'other-instructor',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.getPostDetail(post.id, UserType.INSTRUCTOR, 'instructor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 담당 강사의 것이 아닌 게시글을 상세 조회하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        instructorId: 'other-instructor',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        mockInstructor.id,
      );

      await expect(
        service.getPostDetail(post.id, UserType.ASSISTANT, 'assistant-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    describe('학생 조회 권한', () => {
      it('학생이 특정 강의의 공지를 조회할 때, 수강 권한이 없으면 ForbiddenException이 발생한다', async () => {
        const post = mockInstructorPosts.lecture;
        const mockLecture = mockLectures.basic;
        instructorPostsRepo.findById.mockResolvedValue(post);
        lecturesRepo.findById.mockResolvedValue(mockLecture);
        permissionService.validateLectureReadAccess.mockRejectedValue(
          new ForbiddenException('수강 권한이 없습니다.'),
        );

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('학생이 존재하지 않는 강의의 공지를 조회하려고 하면 NotFoundException이 발생한다', async () => {
        const post = mockInstructorPosts.lecture;
        instructorPostsRepo.findById.mockResolvedValue(post);
        lecturesRepo.findById.mockResolvedValue(null);

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(NotFoundException);
      });

      it('학생이 전체(GLOBAL) 공지를 조회할 때, 해당 강사의 강의를 하나라도 수강 중이면 상세 정보를 반환한다', async () => {
        const post = mockInstructorPosts.global;
        instructorPostsRepo.findById.mockResolvedValue(post);
        permissionService.validateInstructorStudentLink.mockResolvedValue(
          undefined,
        );

        const result = await service.getPostDetail(
          post.id,
          UserType.STUDENT,
          'student-1',
        );

        expect(result).toEqual(post);
        expect(
          permissionService.validateInstructorStudentLink,
        ).toHaveBeenCalledWith(post.instructorId, 'student-1');
      });

      it('학생이 전체(GLOBAL) 공지를 조회할 때, 해당 강사의 강의를 하나도 수강 중이지 않으면 ForbiddenException이 발생한다', async () => {
        const post = mockInstructorPosts.global;
        instructorPostsRepo.findById.mockResolvedValue(post);
        permissionService.validateInstructorStudentLink.mockRejectedValue(
          new ForbiddenException(''),
        );

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('학생이 강의(LECTURE) 공지를 조회할 때, 해당 강의를 수강 중이면 상세 정보를 반환한다', async () => {
        const post = mockInstructorPosts.lecture;
        const mockLecture = mockLectures.basic;
        instructorPostsRepo.findById.mockResolvedValue(post);
        lecturesRepo.findById.mockResolvedValue(mockLecture);
        permissionService.validateLectureReadAccess.mockResolvedValue(
          undefined,
        );
        lectureEnrollmentsRepo.existsByLectureIdAndStudentId.mockResolvedValue(
          true,
        );

        const result = await service.getPostDetail(
          post.id,
          UserType.STUDENT,
          'student-1',
        );

        expect(result).toEqual(post);
        expect(
          permissionService.validateLectureReadAccess,
        ).toHaveBeenCalledWith(
          post.lectureId,
          mockLecture,
          UserType.STUDENT,
          'student-1',
        );
      });

      it('학생이 강의(LECTURE) 공지를 조회할 때, 해당 강의를 수강 중이지 않으면 ForbiddenException이 발생한다', async () => {
        const post = mockInstructorPosts.lecture;
        const mockLecture = mockLectures.basic;
        instructorPostsRepo.findById.mockResolvedValue(post);
        lecturesRepo.findById.mockResolvedValue(mockLecture);
        permissionService.validateLectureReadAccess.mockRejectedValue(
          new ForbiddenException(''),
        );

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('학생이 선택(SELECTED) 공지를 조회할 때, 본인이 타겟에 포함되어 있으면 상세 정보를 반환한다', async () => {
        const profileId = 'student-1';
        const post = {
          ...mockInstructorPosts.selected,
          targets: [
            {
              instructorPostId: mockInstructorPosts.selected.id,
              enrollmentId: 'enrollment-1',
              enrollment: { appStudentId: profileId, studentName: '김학생' },
            },
          ],
        };
        instructorPostsRepo.findById.mockResolvedValue(
          post as unknown as InstructorPostWithDetails,
        );

        const result = await service.getPostDetail(
          post.id,
          UserType.STUDENT,
          profileId,
        );

        expect(result).toEqual(post);
      });

      it('학생이 선택(SELECTED) 공지를 조회할 때, 본인이 타겟에 포함되어 있지 않으면 ForbiddenException이 발생한다', async () => {
        const post = {
          ...mockInstructorPosts.selected,
          targets: [
            {
              instructorPostId: mockInstructorPosts.selected.id,
              enrollmentId: 'enrollment-other',
              enrollment: {
                appStudentId: 'other-student',
                studentName: '이학생',
              },
            },
          ],
        };
        instructorPostsRepo.findById.mockResolvedValue(
          post as unknown as InstructorPostWithDetails,
        );

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('updatePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      instructorPostsRepo.findById.mockResolvedValue(null);

      await expect(
        service.updatePost(
          'invalid-id',
          { title: 'updated' },
          UserType.INSTRUCTOR,
          'instructor-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('강사가 본인의 게시글이 아닌 것을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        instructorId: 'other-instructor',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.updatePost(
          post.id,
          { title: 'updated' },
          UserType.INSTRUCTOR,
          'instructor-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 본인이 작성하지 않은 게시글을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        authorAssistantId: 'other-assistant',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.updatePost(
          post.id,
          { title: 'updated' },
          UserType.ASSISTANT,
          'assistant-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('유효한 권한으로 수정 요청 시 제목, 내용, 자료 등을 업데이트하고 결과를 반환한다', async () => {
      const post = mockInstructorPosts.global;
      instructorPostsRepo.findById.mockResolvedValue(post);
      instructorPostsRepo.update.mockResolvedValue({
        ...post,
        title: 'updated title',
      });

      const result = await service.updatePost(
        post.id,
        { title: 'updated title' },
        UserType.INSTRUCTOR,
        post.instructorId,
      );

      expect(instructorPostsRepo.update).toHaveBeenCalled();
      expect(result.title).toBe('updated title');
    });

    describe('엣지 케이스 (Failing Tests)', () => {
      it('기존 내용과 동일한 내용으로 수정을 요청할 경우, 불필요한 DB 업데이트를 방지하기 위해 업데이트를 수행하지 않아야 한다', async () => {
        const post = mockInstructorPosts.global;
        const profileId = post.instructorId;
        const updateData = {
          title: post.title,
          content: post.content,
          isImportant: post.isImportant,
          scope: post.scope,
          targetRole: post.targetRole,
        };

        instructorPostsRepo.findById.mockResolvedValue(post);

        await service.updatePost(
          post.id,
          updateData,
          UserType.INSTRUCTOR,
          profileId,
        );

        expect(instructorPostsRepo.update).not.toHaveBeenCalled();
      });

      it('스코프(scope)를 SELECTED로 변경하면서 타겟 학생 명단(targetEnrollmentIds)을 제공하지 않으면 BadRequestException이 발생해야 한다', async () => {
        const post = mockInstructorPosts.global;
        instructorPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.updatePost(
            post.id,
            { scope: PostScope.SELECTED, targetEnrollmentIds: [] },
            UserType.INSTRUCTOR,
            post.instructorId,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('스코프(scope)를 LECTURE로 변경하면서 lectureId를 누락한 경우 BadRequestException이 발생해야 한다', async () => {
        const post = { ...mockInstructorPosts.global, lectureId: null };
        instructorPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.updatePost(
            post.id,
            { scope: PostScope.LECTURE },
            UserType.INSTRUCTOR,
            post.instructorId,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      describe('보안 검증', () => {
        it('본인의 게시글이라 하더라도 타인의 자료를 첨부하려고 하면 ForbiddenException이 발생해야 한다', async () => {
          const post = mockInstructorPosts.global;
          const profileId = post.instructorId;
          const stolenMaterialId = 'stolen-material-id';
          const updateData = {
            materialIds: [stolenMaterialId],
          };

          instructorPostsRepo.findById.mockResolvedValue(post);
          const stolenMaterial: MockMaterial = {
            id: stolenMaterialId,
            instructorId: 'other-instructor',
          };
          materialsRepo.findByIds.mockResolvedValue([
            stolenMaterial as Prisma.MaterialGetPayload<Record<string, never>>,
          ]);

          await expect(
            service.updatePost(
              post.id,
              updateData,
              UserType.INSTRUCTOR,
              profileId,
            ),
          ).rejects.toThrow(ForbiddenException);
        });
      });
    });
  });

  describe('deletePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      instructorPostsRepo.findById.mockResolvedValue(null);

      await expect(
        service.deletePost('invalid-id', UserType.INSTRUCTOR, 'instructor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('강사가 본인의 게시글이 아닌 것을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        instructorId: 'other-instructor',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.deletePost(post.id, UserType.INSTRUCTOR, 'instructor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('조교가 본인이 작성하지 않은 게시글을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        authorAssistantId: 'other-assistant',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.deletePost(post.id, UserType.ASSISTANT, 'assistant-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('유효한 권한으로 삭제 요청 시 게시글이 성공적으로 삭제된다', async () => {
      const post = mockInstructorPosts.global;
      instructorPostsRepo.findById.mockResolvedValue(post);
      instructorPostsRepo.delete.mockResolvedValue(post);

      await service.deletePost(post.id, UserType.INSTRUCTOR, post.instructorId);

      expect(instructorPostsRepo.delete).toHaveBeenCalledWith(post.id);
    });
  });

  describe('createPost - 추가 검증', () => {
    it('제목이 빈 문자열이면 BadRequestException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.createPost(
          { title: '', content: 'test', scope: PostScope.GLOBAL },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('내용이 빈 문자열이면 BadRequestException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.createPost(
          { title: 'test', content: '', scope: PostScope.GLOBAL },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('제목이 100자를 초과하면 BadRequestException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      const longTitle = 'a'.repeat(101);

      await expect(
        service.createPost(
          { title: longTitle, content: 'test', scope: PostScope.GLOBAL },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('존재하지 않는 lectureId로 강의 공지를 생성하려고 하면 NotFoundException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      lecturesRepo.findById.mockResolvedValue(null);

      await expect(
        service.createPost(
          {
            title: 'test',
            content: 'test',
            scope: PostScope.LECTURE,
            lectureId: 'non-existent',
          },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('존재하지 않는 enrollmentId로 선택 공지를 생성하려고 하면 NotFoundException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      enrollmentsRepo.findByIds.mockResolvedValue([]); // 존재하지 않는 enrollmentId

      await expect(
        service.createPost(
          {
            title: 'test',
            content: 'test',
            scope: PostScope.SELECTED,
            targetEnrollmentIds: ['non-existent'],
          },
          instructorId,
          UserType.INSTRUCTOR,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePost - 추가 검증', () => {
    it('다른 강사가 작성한 게시글을 수정하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        instructorId: 'other-instructor',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.updatePost(
          post.id,
          { title: 'updated' },
          UserType.INSTRUCTOR,
          'instructor-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('강사는 조교가 작성한 게시글을 수정할 수 있어야 한다', async () => {
      const post = {
        ...mockInstructorPosts.global,
        authorAssistantId: 'assistant-1',
      };
      instructorPostsRepo.findById.mockResolvedValue(post);
      instructorPostsRepo.update.mockResolvedValue({
        ...post,
        title: 'updated title',
      });

      const result = await service.updatePost(
        post.id,
        { title: 'updated title' },
        UserType.INSTRUCTOR,
        post.instructorId,
      );

      expect(instructorPostsRepo.update).toHaveBeenCalled();
      expect(result.title).toBe('updated title');
    });
  });

  describe('deletePost - 추가 검증', () => {
    it('학생이 게시글을 삭제하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const post = mockInstructorPosts.global;
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.deletePost(post.id, UserType.STUDENT, 'student-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('학부모가 게시글을 삭제하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const post = mockInstructorPosts.global;
      instructorPostsRepo.findById.mockResolvedValue(post);

      await expect(
        service.deletePost(post.id, UserType.PARENT, 'parent-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPostList - 추가 검증', () => {
    it('page가 0 이하이면 BadRequestException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.getPostList(
          { page: 0, limit: 10 },
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('limit이 100을 초과하면 BadRequestException이 발생해야 한다', async () => {
      const instructorId = mockInstructor.id;
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      await expect(
        service.getPostList(
          { page: 1, limit: 101 },
          UserType.INSTRUCTOR,
          instructorId,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPostDetail - 추가 검증', () => {
    // Note: deletedAt 필드가 모델에 없어서 관련 테스트 제거
  });

  describe('getPostTargets - 추가 검증', () => {
    it('학생이 게시글 대상 목록을 조회하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      await expect(
        service.getPostTargets(UserType.STUDENT, 'student-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('학부모가 게시글 대상 목록을 조회하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      await expect(
        service.getPostTargets(UserType.PARENT, 'parent-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
