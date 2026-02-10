import { InstructorPostsService } from './instructor-posts.service.js';
import {
  createMockInstructorPostsRepository,
  createMockLecturesRepository,
  createMockMaterialsRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { mockInstructorPosts } from '../test/fixtures/posts.fixture.js';
import { mockLectures } from '../test/fixtures/lectures.fixture.js';
import type { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { MaterialsRepository } from '../repos/materials.repo.js';
import type { PermissionService } from './permission.service.js';

describe('InstructorPostsService', () => {
  let service: InstructorPostsService;
  let instructorPostsRepo: jest.Mocked<InstructorPostsRepository>;
  let lecturesRepo: jest.Mocked<LecturesRepository>;
  let materialsRepo: jest.Mocked<MaterialsRepository>;
  let permissionService: jest.Mocked<PermissionService>;

  beforeEach(() => {
    instructorPostsRepo = createMockInstructorPostsRepository();
    lecturesRepo = createMockLecturesRepository();
    materialsRepo = createMockMaterialsRepository();
    permissionService = createMockPermissionService();

    service = new InstructorPostsService(
      instructorPostsRepo,
      lecturesRepo,
      materialsRepo,
      permissionService,
    );
  });

  describe('createPost', () => {
    it('강사 또는 조교가 아닌 사용자가 호출하면 ForbiddenException이 발생한다', async () => {
      // TODO: 권한 검증 (강사/조교만 가능)
    });

    it('조교가 호출할 때 담당 강사 정보를 찾을 수 없으면 ForbiddenException이 발생한다', async () => {
      // TODO: permissionService.getInstructorIdByAssistantId 가 null 반환 시
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: lecturesRepository.findById 가 null 반환 시
    });

    it('강의 공지(LECTURE) 생성 시 해당 강의의 담당 강사가 아니면 ForbiddenException이 발생한다', async () => {
      // TODO: lecture.instructorId !== instructorId
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 누락되면 BadRequestException이 발생한다', async () => {
      // TODO: data.scope === LECTURE && !data.lectureId
    });

    it('선택 공지(SELECTED) 생성 시 타겟 학생이 지정되지 않으면 BadRequestException이 발생한다', async () => {
      // TODO: SELECTED 스코프인데 targetEnrollmentIds 가 비어있을 때
    });

    describe('자료 소유권 검증 (validateMaterialOwnership)', () => {
      it('첨부하려는 자료 중 일부가 존재하지 않으면 NotFoundException이 발생한다', async () => {
        // TODO: materialsRepository.findByIds 결과 개수 불일치
      });

      it('다른 강사의 라이브러리 자료를 첨부하려고 하면 ForbiddenException이 발생한다', async () => {
        // TODO: material.instructorId !== instructorId
      });
    });

    it('모든 유효성 검사를 통과하면 게시글을 생성하고 상세 정보를 반환한다', async () => {
      // TODO: instructorPostsRepository.create 호출 및 반환
    });
  });

  describe('getPostList', () => {
    it('강사가 조회하면 본인의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      // TODO: userType === INSTRUCTOR 인 경우
    });

    it('조교가 조회하면 담당 강사의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      // TODO: userType === ASSISTANT 인 경우
    });

    it('학생이 조회할 때 본인이 대상이 아니거나 scope가 유효하지 않은 게시글은 목록에 포함되지 않아야 한다', async () => {
      const query = { page: 1, limit: 10 };
      const validPost = mockInstructorPosts.global;
      const otherTargetedPost = {
        ...mockInstructorPosts.selected,
        id: 'other-target',
        targets: [
          {
            instructorPostId: 'other-target',
            enrollmentId: 'enrollment-other',
            enrollment: {
              appStudentId: 'other-student',
              studentName: '이학생',
            },
          },
        ],
      };
      const invalidScopePost = {
        ...mockInstructorPosts.global,
        id: 'invalid-scope',
        scope: 'INVALID',
      };

      instructorPostsRepo.findMany.mockResolvedValue({
        posts: [validPost, otherTargetedPost, invalidScopePost],
        totalCount: 3,
      });

      const result = await service.getPostList(
        query,
        UserType.STUDENT,
        'student-1',
      );

      // 본인에게 유효한 게시글만 필터링되어야 함
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].id).toBe(validPost.id);
    });

    it('검색어, 페이지네이션 필터가 포함된 경우 정상적으로 목록을 반환한다', async () => {
      // TODO: instructorPostsRepository.findMany 호출
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
      // TODO: post.instructorId !== assistant.instructorId
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
        lecturesRepo.findById.mockResolvedValue(null);

        await expect(
          service.getPostDetail('post-id', UserType.STUDENT, 'student-1'),
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
        instructorPostsRepo.findById.mockResolvedValue(post);

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
        instructorPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('updatePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: instructorPostsRepository.findById 가 null 반환 시
    });

    it('강사가 본인의 게시글이 아닌 것을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== profileId
    });

    it('조교가 본인이 작성하지 않은 게시글을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.authorAssistantId !== profileId
    });

    it('유효한 권한으로 수정 요청 시 제목, 내용, 자료 등을 업데이트하고 결과를 반환한다', async () => {
      // TODO: instructorPostsRepository.update 호출
    });

    describe('엣지 케이스 (Failing Tests)', () => {
      it('기존 내용과 동일한 내용으로 수정을 요청할 경우, 불필요한 DB 업데이트를 방지하기 위해 에러를 발생시키거나 업데이트를 수행하지 않아야 한다', async () => {
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

        // repo.update가 호출되지 않아야 함 (Edge Case)
        expect(instructorPostsRepo.update).not.toHaveBeenCalled();
      });

      it('스코프(scope)를 SELECTED로 변경하면서 타겟 학생 명단(targetEnrollmentIds)을 제공하지 않으면 BadRequestException이 발생해야 한다', async () => {
        // TODO: 스코프 변경에 따른 필수 값 검증
      });

      it('스코프(scope)를 LECTURE로 변경하면서 lectureId를 누락한 경우 BadRequestException이 발생해야 한다', async () => {
        // TODO: LECTURE 스코프 필수 값 검증
      });

      it('게시글의 소유 강사(instructorId)를 다른 강사의 ID로 변경하려는 시도는 ForbiddenException을 발생시켜야 한다', async () => {
        // TODO: 소유권 이전 방지 로직
      });

      it('수정 요청 시 제목(title)이나 내용(content)이 공백으로만 이루어진 경우 BadRequestException이 발생해야 한다', async () => {
        // TODO: 공백 문자열 검증
      });
    });
  });

  describe('deletePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: instructorPostsRepository.findById 가 null 반환 시
    });

    it('강사가 본인의 게시글이 아닌 것을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== profileId
    });

    it('조교가 본인이 작성하지 않은 게시글을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.authorAssistantId !== profileId
    });

    it('유효한 권한으로 삭제 요청 시 게시글이 성공적으로 삭제된다', async () => {
      // TODO: instructorPostsRepository.delete 호출
    });
  });
});
