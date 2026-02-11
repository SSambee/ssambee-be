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
} from '../err/http.exception.js';
import type { CommentsRepository } from '../repos/comments.repo.js';
import type { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import type { StudentPostsRepository } from '../repos/student-posts.repo.js';
import type { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { MaterialsRepository } from '../repos/materials.repo.js';
import type { PermissionService } from './permission.service.js';

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
});
