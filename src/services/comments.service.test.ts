import { CommentsService } from './comments.service.js';
import {
  createMockCommentsRepository,
  createMockInstructorPostsRepository,
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockMaterialsRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import type { CommentsRepository } from '../repos/comments.repo.js';
import type { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import type { StudentPostsRepository } from '../repos/student-posts.repo.js';
import type { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { MaterialsRepository } from '../repos/materials.repo.js';
import type { PermissionService } from './permission.service.js';
import type { Comment } from '../generated/prisma/client.js';

describe('CommentsService 보안 검증', () => {
  let service: CommentsService;
  let commentsRepo: jest.Mocked<CommentsRepository>;
  let instructorPostsRepo: jest.Mocked<InstructorPostsRepository>;
  let studentPostsRepo: jest.Mocked<StudentPostsRepository>;
  let enrollmentsRepo: jest.Mocked<EnrollmentsRepository>;
  let lectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let materialsRepo: jest.Mocked<MaterialsRepository>;
  let permissionService: jest.Mocked<PermissionService>;

  beforeEach(() => {
    commentsRepo = createMockCommentsRepository();
    instructorPostsRepo = createMockInstructorPostsRepository();
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    materialsRepo = createMockMaterialsRepository();
    permissionService = createMockPermissionService();

    service = new CommentsService(
      commentsRepo,
      instructorPostsRepo,
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      materialsRepo,
      permissionService,
      // @ts-expect-error - parentChildLinkRepository is not needed for these tests
      null,
    );
  });

  describe('자료 소유권 검증 (materialIds)', () => {
    const instructorId = 'instructor-1';
    const profileId = instructorId;
    const userType = UserType.INSTRUCTOR;

    const mockPost = { id: 'post-1', instructorId };
    const mockComment = {
      id: 'comment-1',
      instructorId,
      instructorPostId: 'post-1',
    };

    beforeEach(() => {
      instructorPostsRepo.findById.mockResolvedValue(
        mockPost as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );
      commentsRepo.findById.mockResolvedValue(
        mockComment as unknown as Comment,
      );
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
    });

    it('댓글 생성 시 타인의 자료를 첨부하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const stolenMaterialId = 'stolen-material-id';
      const data = {
        instructorPostId: 'post-1',
        content: 'test',
        materialIds: [stolenMaterialId],
      };

      // 타인의 자료로 시뮬레이션
      materialsRepo.findByIds.mockResolvedValue([
        { id: stolenMaterialId, instructorId: 'other-instructor' },
      ] as unknown as Parameters<
        NonNullable<Parameters<typeof materialsRepo.findByIds>[0]>
      >[0]);

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('댓글 수정 시 타인의 자료를 첨부하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const stolenMaterialId = 'stolen-material-id';
      const data = {
        content: 'updated',
        materialIds: [stolenMaterialId],
      };

      // 타인의 자료로 시뮬레이션
      materialsRepo.findByIds.mockResolvedValue([
        { id: stolenMaterialId, instructorId: 'other-instructor' },
      ] as unknown as Parameters<
        NonNullable<Parameters<typeof materialsRepo.findByIds>[0]>
      >[0]);

      await expect(
        service.updateComment(
          'comment-1',
          data,
          userType,
          profileId,
          'post-1',
          'instructorPost',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('본인의 자료를 첨부하면 정상적으로 처리되어야 한다', async () => {
      const myMaterialId = 'my-material-id';
      const data = {
        content: 'updated',
        materialIds: [myMaterialId],
      };

      materialsRepo.findByIds.mockResolvedValue([
        { id: myMaterialId, instructorId },
      ] as unknown as Parameters<
        NonNullable<Parameters<typeof materialsRepo.findByIds>[0]>
      >[0]);
      commentsRepo.update.mockResolvedValue({
        id: 'comment-1',
      } as unknown as Comment);

      await service.updateComment(
        'comment-1',
        data,
        userType,
        profileId,
        'post-1',
        'instructorPost',
      );

      expect(commentsRepo.update).toHaveBeenCalledWith('comment-1', {
        content: 'updated',
        materialIds: [myMaterialId],
      });
    });

    it('분실된 자료 ID가 포함된 경우 NotFoundException이 발생해야 한다', async () => {
      const missingId = 'missing-id';
      const data = {
        content: 'updated',
        materialIds: [missingId],
      };

      materialsRepo.findByIds.mockResolvedValue([]); // 아무것도 찾지 못함

      await expect(
        service.updateComment(
          'comment-1',
          data,
          userType,
          profileId,
          'post-1',
          'instructorPost',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('게시글 접근 권한 검증 (IDOR)', () => {
    const instructorId = 'my-instructor-id';
    const otherInstructorId = 'other-instructor-id';
    const profileId = instructorId;
    const userType = UserType.INSTRUCTOR;

    beforeEach(() => {
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      permissionService.validateInstructorAccess.mockImplementation(
        async (targetId, type, profId) => {
          const effectiveId =
            type === UserType.INSTRUCTOR ? profId : 'assistant-logic';
          if (effectiveId !== targetId)
            throw new ForbiddenException('권한 없음');
        },
      );
    });

    it('타 강사의 공지에 댓글을 작성하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const otherPost = { id: 'other-post', instructorId: otherInstructorId };
      instructorPostsRepo.findById.mockResolvedValue(
        otherPost as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );

      const data = { instructorPostId: 'other-post', content: 'hello' };

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('타 강사의 학생 질문에 답변을 작성하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const otherStudentPost = {
        id: 'other-student-post',
        instructorId: otherInstructorId,
      };
      studentPostsRepo.findById.mockResolvedValue(
        otherStudentPost as unknown as Parameters<
          NonNullable<Parameters<typeof studentPostsRepo.findById>[0]>
        >[0],
      );

      const data = { studentPostId: 'other-student-post', content: 'answer' };

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('본인의 댓글이라도 타인의 게시글에 있는 것이라면 수정을 막아야 한다', async () => {
      // 1. 타인의 게시글 준비
      const otherPost = { id: 'other-post', instructorId: otherInstructorId };
      instructorPostsRepo.findById.mockResolvedValue(
        otherPost as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );

      // 2. 내 댓글이지만 저 게시글에 속해 있다고 가정
      const myCommentOnOtherPost = {
        id: 'my-comment',
        instructorId: instructorId, // 내꺼
        instructorPostId: 'other-post',
      };
      commentsRepo.findById.mockResolvedValue(
        myCommentOnOtherPost as unknown as Comment,
      );

      const data = { content: 'hack' };

      await expect(
        service.updateComment(
          'my-comment',
          data,
          userType,
          profileId,
          'other-post',
          'instructorPost',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('본인의 댓글이라도 타인의 게시글에 있는 것이라면 삭제를 막아야 한다', async () => {
      const otherPost = { id: 'other-post', instructorId: otherInstructorId };
      instructorPostsRepo.findById.mockResolvedValue(
        otherPost as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );

      const myCommentOnOtherPost = {
        id: 'my-comment',
        instructorId: instructorId,
        instructorPostId: 'other-post',
      };
      commentsRepo.findById.mockResolvedValue(
        myCommentOnOtherPost as unknown as Comment,
      );

      await expect(
        service.deleteComment(
          'my-comment',
          userType,
          profileId,
          'other-post',
          'instructorPost',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('대댓글 및 삭제된 게시글 처리 (DDD/TDD)', () => {
    const instructorId = 'instructor-1';
    const profileId = instructorId;
    const userType = UserType.INSTRUCTOR;

    it('대댓글 생성 시 parentId가 정확히 저장되어야 한다', async () => {
      const parentCommentId = 'parent-1';
      const postId = 'post-1';
      const data = {
        instructorPostId: postId,
        content: 'reply content',
        parentId: parentCommentId,
      };

      instructorPostsRepo.findById.mockResolvedValue(
        { id: postId, instructorId } as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      commentsRepo.findById.mockResolvedValue({
        id: parentCommentId,
        instructorPostId: postId,
      } as unknown as Comment);
      commentsRepo.create.mockResolvedValue({
        id: 'reply-1',
        ...data,
      } as unknown as Comment);

      const result = await service.createComment(data, userType, profileId);

      expect(result.parentId).toBe(parentCommentId);
      expect(commentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parentId: parentCommentId,
        }),
      );
    });

    it('삭제된 게시글(존재하지 않는 게시글)에 댓글을 작성하려고 하면 NotFoundException이 발생해야 한다', async () => {
      instructorPostsRepo.findById.mockResolvedValue(null);
      const data = { instructorPostId: 'deleted-post', content: 'test' };

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow(NotFoundException);
    });

    it('대댓글 작성 시 부모 댓글이 다른 게시글의 댓글이면 BadRequestException이 발생해야 한다', async () => {
      const parentCommentId = 'parent-on-other-post';
      const postId = 'post-1';
      const otherPostId = 'post-2';
      const data = {
        instructorPostId: postId,
        content: 'reply content',
        parentId: parentCommentId,
      };

      instructorPostsRepo.findById.mockResolvedValue(
        { id: postId, instructorId } as unknown as Parameters<
          NonNullable<Parameters<typeof instructorPostsRepo.findById>[0]>
        >[0],
      );
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );

      // 부모 댓글이 다른 게시글(otherPostId)에 속해 있음
      commentsRepo.findById.mockResolvedValue({
        id: parentCommentId,
        instructorPostId: otherPostId,
      } as unknown as Comment);
      commentsRepo.create.mockResolvedValue({} as unknown as Comment);

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow('부모 댓글이 현재 게시글에 속해있지 않습니다.');
    });
  });
});
