import { CommentsService } from './comments.service.js';
import {
  createMockCommentsRepository,
  createMockInstructorPostsRepository,
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockMaterialsRepository,
  createMockParentChildLinkRepository,
} from '../test/mocks/repo.mock.js';
import {
  createMockPermissionService,
  createMockFileStorageService,
} from '../test/mocks/services.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import type { CommentsRepository } from '../repos/comments.repo.js';
import type { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import type { StudentPostsRepository } from '../repos/student-posts.repo.js';
import type { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { MaterialsRepository } from '../repos/materials.repo.js';
import type { PermissionService } from './permission.service.js';
import type { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import type { FileStorageService } from './filestorage.service.js';

describe('CommentsService 보안 검증', () => {
  let service: CommentsService;
  let commentsRepo: jest.Mocked<CommentsRepository>;
  let instructorPostsRepo: jest.Mocked<InstructorPostsRepository>;
  let studentPostsRepo: jest.Mocked<StudentPostsRepository>;
  let enrollmentsRepo: jest.Mocked<EnrollmentsRepository>;
  let lectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let materialsRepo: jest.Mocked<MaterialsRepository>;
  let permissionService: jest.Mocked<PermissionService>;
  let parentChildLinkRepo: jest.Mocked<ParentChildLinkRepository>;
  let fileStorageService: jest.Mocked<FileStorageService>;

  beforeEach(() => {
    commentsRepo = createMockCommentsRepository();
    instructorPostsRepo = createMockInstructorPostsRepository();
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    materialsRepo = createMockMaterialsRepository();
    permissionService = createMockPermissionService();
    parentChildLinkRepo = createMockParentChildLinkRepository();
    fileStorageService = createMockFileStorageService();

    service = new CommentsService(
      commentsRepo,
      instructorPostsRepo,
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      materialsRepo,
      permissionService,
      parentChildLinkRepo,
      fileStorageService,
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
      instructorPostsRepo.findById.mockResolvedValue(mockPost);
      commentsRepo.findById.mockResolvedValue(mockComment);
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
      ]);

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
      ]);

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
      ]);
      commentsRepo.update.mockResolvedValue({ id: 'comment-1' });

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
      instructorPostsRepo.findById.mockResolvedValue(otherPost);

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
      studentPostsRepo.findById.mockResolvedValue(otherStudentPost);

      const data = { studentPostId: 'other-student-post', content: 'answer' };

      await expect(
        service.createComment(data, userType, profileId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('본인의 댓글이라도 타인의 게시글에 있는 것이라면 수정을 막아야 한다', async () => {
      // 1. 타인의 게시글 준비
      const otherPost = { id: 'other-post', instructorId: otherInstructorId };
      instructorPostsRepo.findById.mockResolvedValue(otherPost);

      // 2. 내 댓글이지만 저 게시글에 속해 있다고 가정 (공격자가 postId를 조작하여 본인 댓글이 있는 것처럼 속이는 경우 등 방지)
      // 사실 validateAndGetComment가 comment.instructorPostId === postId를 체크하므로,
      // comment.instructorPostId가 other-post여야 함.
      const myCommentOnOtherPost = {
        id: 'my-comment',
        instructorId: instructorId, // 내꺼
        instructorPostId: 'other-post', // 하지만 남의 글에 달림 (어떻게든 달았다고 가정)
      };
      commentsRepo.findById.mockResolvedValue(myCommentOnOtherPost);

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
      instructorPostsRepo.findById.mockResolvedValue(otherPost);

      const myCommentOnOtherPost = {
        id: 'my-comment',
        instructorId: instructorId,
        instructorPostId: 'other-post',
      };
      commentsRepo.findById.mockResolvedValue(myCommentOnOtherPost);

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

  describe('SELECTED 스코프 게시글 댓글 권한 검증', () => {
    const studentId = 'student-1';
    const enrollmentId = 'enrollment-1';
    const instructorId = 'instructor-1';
    const postId = 'selected-post-id';

    beforeEach(() => {
      // 기본적으로 수강생임을 가정
      lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue({
        enrollmentId,
        enrollment: { id: enrollmentId, appStudentId: studentId, instructorId }
      } as unknown as never);
      lectureEnrollmentsRepo.findFirstByInstructorIdAndStudentId.mockResolvedValue({
        enrollmentId,
        enrollment: { id: enrollmentId, appStudentId: studentId, instructorId }
      } as unknown as never);
      enrollmentsRepo.findById.mockResolvedValue({
        id: enrollmentId,
        appStudentId: studentId,
        instructorId,
      } as unknown as never);

      // 댓글 생성 성공 시 기본 리턴값 (실패 테스트에서 이 로직까지 오면 안 됨)
      commentsRepo.create.mockResolvedValue({
        id: 'new-comment-id',
        content: 'test content',
        enrollment: { appStudentId: studentId },
        attachments: []
      } as unknown as never);
    });

    it('학생이 본인이 타겟팅되지 않은 SELECTED 스코프 공지에 댓글을 작성하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const selectedPost = {
        id: postId,
        instructorId,
        scope: 'SELECTED',
        targets: [
          { enrollmentId: 'other-enrollment-id' }
        ],
      };
      instructorPostsRepo.findById.mockResolvedValue(selectedPost as unknown as never);

      const data = {
        instructorPostId: postId,
        content: 'test content',
      };

      await expect(
        service.createComment(data, UserType.STUDENT, studentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('학부모가 자녀가 타겟팅되지 않은 SELECTED 스코프 공지에 댓글을 작성하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const parentId = 'parent-1';
      const childLinkId = 'child-link-1';

      const selectedPost = {
        id: postId,
        instructorId,
        scope: 'SELECTED',
        targets: [
          { enrollmentId: 'other-enrollment-id' }
        ],
      };
      instructorPostsRepo.findById.mockResolvedValue(selectedPost as unknown as never);

      // 학부모 정보 모킹
      parentChildLinkRepo.findByAppParentId.mockResolvedValue([{ id: childLinkId, appParentId: parentId, name: 'child', phoneNumber: '01012345678' }] as unknown as never);
      permissionService.getParentEnrollmentIds.mockResolvedValue([enrollmentId]);

      // 자녀의 Enrollment 모킹
      enrollmentsRepo.findManyByAppParentLinkIds.mockResolvedValue([
        { id: enrollmentId, instructorId, appParentLinkId: childLinkId }
      ] as unknown as never);

      const data = {
        instructorPostId: postId,
        content: 'parent comment',
      };

      await expect(
        service.createComment(data, UserType.PARENT, parentId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('GLOBAL 스코프 공지에는 수강생이면 누구나 댓글을 작성할 수 있어야 한다', async () => {
      const globalPost = {
        id: postId,
        instructorId,
        scope: 'GLOBAL',
      };
      instructorPostsRepo.findById.mockResolvedValue(globalPost as unknown as never);

      const data = {
        instructorPostId: postId,
        content: 'global comment',
      };

      const result = await service.createComment(data, UserType.STUDENT, studentId);
      expect(result.id).toBe('new-comment-id');
    });
  });
});
