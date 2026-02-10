import { StudentPostsService } from './student-posts.service.js';
import {
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
  createMockCommentsRepository,
} from '../test/mocks/repo.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('StudentPostsService', () => {
  let service: StudentPostsService;
  let studentPostsRepo: ReturnType<typeof createMockStudentPostsRepository>;
  let enrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let lectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let lecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let commentsRepo: ReturnType<typeof createMockCommentsRepository>;

  beforeEach(() => {
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    lecturesRepo = createMockLecturesRepository();
    commentsRepo = createMockCommentsRepository();

    service = new StudentPostsService(
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      lecturesRepo,
      commentsRepo,
    );
  });

  describe('updateComment', () => {
    const VALID_STUDENT_ID = 'student-1';
    const VALID_INSTRUCTOR_ID = 'instructor-1';
    const VALID_PARENT_ID = 'parent-1';
    const VALID_COMMENT_ID = 'comment-1';
    const INVALID_COMMENT_ID = 'invalid-comment-id';

    describe('학생(STUDENT) 권한', () => {
      it('존재하지 않는 댓글 ID인 경우 NotFoundException을 던져야 한다', async () => {
        commentsRepo.findById.mockResolvedValue(null);

        await expect(
          service.updateComment(
            INVALID_COMMENT_ID,
            '수정된 내용',
            UserType.STUDENT,
            VALID_STUDENT_ID,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('본인의 댓글이 아닌 경우 ForbiddenException을 던져야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: 'enrollment-1',
          instructorId: null,
        };
        const otherEnrollment = {
          id: 'enrollment-1',
          instructorId: VALID_INSTRUCTOR_ID,
          appStudentId: 'other-student',
        };

        commentsRepo.findById.mockResolvedValue(comment);
        enrollmentsRepo.findById.mockResolvedValue(otherEnrollment);

        await expect(
          service.updateComment(
            VALID_COMMENT_ID,
            '수정된 내용',
            UserType.STUDENT,
            VALID_STUDENT_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('본인의 댓글을 성공적으로 수정해야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: 'enrollment-1',
          instructorId: null,
        };
        const myEnrollment = {
          id: 'enrollment-1',
          instructorId: VALID_INSTRUCTOR_ID,
          appStudentId: VALID_STUDENT_ID,
        };
        const updatedComment = {
          ...comment,
          content: '수정된 댓글 내용',
        };

        commentsRepo.findById.mockResolvedValue(comment);
        enrollmentsRepo.findById.mockResolvedValue(myEnrollment);
        commentsRepo.update.mockResolvedValue(updatedComment);

        const result = await service.updateComment(
          VALID_COMMENT_ID,
          '수정된 댓글 내용',
          UserType.STUDENT,
          VALID_STUDENT_ID,
        );

        expect(result).toEqual(updatedComment);
        expect(commentsRepo.update).toHaveBeenCalledWith(VALID_COMMENT_ID, {
          content: '수정된 댓글 내용',
        });
      });

      it('enrollment가 null인 경우 ForbiddenException을 던져야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: 'enrollment-1',
          instructorId: null,
        };

        commentsRepo.findById.mockResolvedValue(comment);
        enrollmentsRepo.findById.mockResolvedValue(null);

        await expect(
          service.updateComment(
            VALID_COMMENT_ID,
            '수정된 내용',
            UserType.STUDENT,
            VALID_STUDENT_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('강사(INSTRUCTOR) 권한', () => {
      it('존재하지 않는 댓글 ID인 경우 NotFoundException을 던져야 한다', async () => {
        commentsRepo.findById.mockResolvedValue(null);

        await expect(
          service.updateComment(
            INVALID_COMMENT_ID,
            '수정된 내용',
            UserType.INSTRUCTOR,
            VALID_INSTRUCTOR_ID,
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('타인의 댓글을 수정하려고 하면 ForbiddenException을 던져야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: null,
          instructorId: 'other-instructor',
        };

        commentsRepo.findById.mockResolvedValue(comment);

        await expect(
          service.updateComment(
            VALID_COMMENT_ID,
            '수정된 내용',
            UserType.INSTRUCTOR,
            VALID_INSTRUCTOR_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('본인의 댓글을 성공적으로 수정해야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: null,
          instructorId: VALID_INSTRUCTOR_ID,
        };
        const updatedComment = {
          ...comment,
          content: '수정된 댓글 내용',
        };

        commentsRepo.findById.mockResolvedValue(comment);
        commentsRepo.update.mockResolvedValue(updatedComment);

        const result = await service.updateComment(
          VALID_COMMENT_ID,
          '수정된 댓글 내용',
          UserType.INSTRUCTOR,
          VALID_INSTRUCTOR_ID,
        );

        expect(result).toEqual(updatedComment);
        expect(commentsRepo.update).toHaveBeenCalledWith(VALID_COMMENT_ID, {
          content: '수정된 댓글 내용',
        });
      });

      it('instructorId가 null인 타인의 댓글은 수정할 수 없어야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: null,
          instructorId: null,
        };

        commentsRepo.findById.mockResolvedValue(comment);

        await expect(
          service.updateComment(
            VALID_COMMENT_ID,
            '수정된 내용',
            UserType.INSTRUCTOR,
            VALID_INSTRUCTOR_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('학부모(PARENT) 권한', () => {
      it('학부모는 댓글을 수정할 수 없으므로 ForbiddenException을 던져야 한다', async () => {
        const comment = {
          id: VALID_COMMENT_ID,
          content: '원래 댓글 내용',
          enrollmentId: 'enrollment-1',
          instructorId: null,
        };

        commentsRepo.findById.mockResolvedValue(comment);

        await expect(
          service.updateComment(
            VALID_COMMENT_ID,
            '수정된 내용',
            UserType.PARENT,
            VALID_PARENT_ID,
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
