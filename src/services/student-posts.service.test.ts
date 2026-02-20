import { StudentPostsService } from './student-posts.service.js';
import {
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
  createMockCommentsRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import {
  AuthorRole,
  StudentPostStatus,
  InquiryWriterType,
} from '../constants/posts.constant.js';
import { mockLectures } from '../test/fixtures/lectures.fixture.js';
import {
  mockEnrollments,
  mockLectureEnrollment,
  mockEnrollment,
} from '../test/fixtures/enrollments.fixture.js';
import {
  mockStudentPost,
  mockComment,
} from '../test/fixtures/student-posts.fixture.js';

describe('StudentPostsService', () => {
  let service: StudentPostsService;
  let studentPostsRepo: ReturnType<typeof createMockStudentPostsRepository>;
  let enrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let lectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let lecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let commentsRepo: ReturnType<typeof createMockCommentsRepository>;
  let permissionService: ReturnType<typeof createMockPermissionService>;

  beforeEach(() => {
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    lecturesRepo = createMockLecturesRepository();
    commentsRepo = createMockCommentsRepository();
    permissionService = createMockPermissionService();

    service = new StudentPostsService(
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      lecturesRepo,
      commentsRepo,
      permissionService,
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

  describe('createPost', () => {
    const VALID_STUDENT_ID = 'student-1';
    const VALID_LECTURE_ID = 'lecture-1';
    const VALID_ENROLLMENT_ID = 'enrollment-1';
    const VALID_INSTRUCTOR_ID = 'instructor-1';

    it('학생이 수강 중인 강의에 질문을 생성하면 성공해야 한다', async () => {
      const postData = {
        title: '질문 제목',
        content: '질문 내용',
        lectureId: VALID_LECTURE_ID,
      };

      const mockLecture = {
        ...mockLectures.basic,
        id: VALID_LECTURE_ID,
        instructorId: VALID_INSTRUCTOR_ID,
      };
      const enrollment = mockLectureEnrollment(
        VALID_LECTURE_ID,
        VALID_ENROLLMENT_ID,
        {
          enrollment: {
            ...mockEnrollments.active,
            id: VALID_ENROLLMENT_ID,
            appStudentId: VALID_STUDENT_ID,
            instructorId: VALID_INSTRUCTOR_ID,
          },
        },
      );

      lecturesRepo.findById.mockResolvedValue(mockLecture);
      lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(
        enrollment,
      );
      enrollmentsRepo.findById.mockResolvedValue(enrollment.enrollment);
      studentPostsRepo.create.mockResolvedValue({
        id: 'post-1',
        ...postData,
        enrollmentId: VALID_ENROLLMENT_ID,
        instructorId: VALID_INSTRUCTOR_ID,
        status: StudentPostStatus.PENDING,
        authorRole: AuthorRole.STUDENT,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createPost(
        postData,
        UserType.STUDENT,
        VALID_STUDENT_ID,
      );

      expect(result).toBeDefined();
      expect(studentPostsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: postData.title,
          enrollmentId: VALID_ENROLLMENT_ID,
          instructorId: VALID_INSTRUCTOR_ID,
        }),
      );
    });

    it('강의 ID가 없으면 BadRequestException을 던져야 한다', async () => {
      await expect(
        service.createPost(
          { title: 't', content: 'c' },
          UserType.STUDENT,
          VALID_STUDENT_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('수강하지 않는 강의에 질문을 생성하려고 하면 ForbiddenException을 던져야 한다', async () => {
      const postData = {
        title: '질문 제목',
        content: '질문 내용',
        lectureId: VALID_LECTURE_ID,
      };

      lecturesRepo.findById.mockResolvedValue({
        ...mockLectures.basic,
        id: VALID_LECTURE_ID,
      });
      lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(
        null,
      );

      await expect(
        service.createPost(postData, UserType.STUDENT, VALID_STUDENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getPostDetail', () => {
    const VALID_POST_ID = 'post-1';
    const VALID_STUDENT_ID = 'student-1';
    const VALID_INSTRUCTOR_ID = 'instructor-1';

    it('학생이 본인의 질문을 조회하면 성공해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: VALID_POST_ID,
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });
      const enrollment = mockEnrollment({
        id: 'enrollment-1',
        appStudentId: VALID_STUDENT_ID,
      });

      studentPostsRepo.findById.mockResolvedValue(mockPost);
      enrollmentsRepo.findById.mockResolvedValue(enrollment);

      const result = await service.getPostDetail(
        VALID_POST_ID,
        UserType.STUDENT,
        VALID_STUDENT_ID,
      );

      expect(result).toEqual(expect.objectContaining({ id: VALID_POST_ID }));
    });

    it('학생이 타인의 질문을 조회하면 ForbiddenException을 던져야 한다', async () => {
      const mockPost = mockStudentPost({
        id: VALID_POST_ID,
        enrollmentId: 'enrollment-1',
      });
      const enrollment = mockEnrollment({
        id: 'enrollment-1',
        appStudentId: 'other-student',
      });

      studentPostsRepo.findById.mockResolvedValue(mockPost);
      enrollmentsRepo.findById.mockResolvedValue(enrollment);

      await expect(
        service.getPostDetail(
          VALID_POST_ID,
          UserType.STUDENT,
          VALID_STUDENT_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deletePost', () => {
    const VALID_POST_ID = 'post-1';
    const VALID_STUDENT_ID = 'student-1';

    it('학생이 본인의 질문을 삭제하면 성공해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: VALID_POST_ID,
        enrollmentId: 'enrollment-1',
      });
      const enrollment = mockEnrollment({
        id: 'enrollment-1',
        appStudentId: VALID_STUDENT_ID,
      });

      studentPostsRepo.findById.mockResolvedValue(mockPost);
      enrollmentsRepo.findById.mockResolvedValue(enrollment);
      studentPostsRepo.delete.mockResolvedValue(mockPost);

      await service.deletePost(
        VALID_POST_ID,
        UserType.STUDENT,
        VALID_STUDENT_ID,
      );

      expect(studentPostsRepo.delete).toHaveBeenCalledWith(VALID_POST_ID);
    });
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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          enrollmentId: 'enrollment-1',
          instructorId: null,
        });
        const otherEnrollment = mockEnrollment({
          id: 'enrollment-1',
          instructorId: VALID_INSTRUCTOR_ID,
          appStudentId: 'other-student',
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          enrollmentId: 'enrollment-1',
          instructorId: null,
        });
        const myEnrollment = mockEnrollment({
          id: 'enrollment-1',
          instructorId: VALID_INSTRUCTOR_ID,
          appStudentId: VALID_STUDENT_ID,
        });
        const updatedComment = mockComment({
          ...comment,
          content: '수정된 댓글 내용',
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          enrollmentId: 'enrollment-1',
          instructorId: null,
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          instructorId: 'other-instructor',
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          instructorId: VALID_INSTRUCTOR_ID,
        });
        const updatedComment = mockComment({
          ...comment,
          content: '수정된 댓글 내용',
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          instructorId: null,
          enrollmentId: null,
        });

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
        const comment = mockComment({
          id: VALID_COMMENT_ID,
          enrollmentId: 'enrollment-1',
        });

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

  describe('getPostList', () => {
    const VALID_STUDENT_ID = 'student-1';
    const VALID_INSTRUCTOR_ID = 'instructor-1';
    const VALID_LECTURE_ID = 'lecture-1';

    it('학생이 본인의 질문 목록을 조회하면 성공해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.STUDENT,
        VALID_STUDENT_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          appStudentId: VALID_STUDENT_ID,
          page: 1,
          limit: 10,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('강사가 담당 학생의 질문 목록을 조회하면 성공해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          instructorId: VALID_INSTRUCTOR_ID,
          page: 1,
          limit: 10,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('강사의 경우 통계 정보가 포맷팅되어 반환되어야 한다', async () => {
      studentPostsRepo.getStats.mockResolvedValue({
        totalCount: 100, // 전체는 더 많을 수 있음
        thisMonthCount: 10,
        lastMonthCount: 5,
        unansweredCount: 2, // 전체 미답변
        processingCount: 3,
        answeredThisMonthCount: 1,
        unansweredCriteria: 1, // 지연된 건수
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [],
        totalCount: 0,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
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

    it('조교가 담당 강사의 질문 목록을 조회하면 성공해야 한다', async () => {
      const assistantId = 'assistant-1';
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      permissionService.getEffectiveInstructorId.mockResolvedValue(
        VALID_INSTRUCTOR_ID,
      );
      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.ASSISTANT,
        assistantId,
      );

      expect(permissionService.getEffectiveInstructorId).toHaveBeenCalledWith(
        UserType.ASSISTANT,
        assistantId,
      );
      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          instructorId: VALID_INSTRUCTOR_ID,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('학부모가 자녀가 없는 경우 NotFoundException을 던져야 한다', async () => {
      permissionService.getChildLinks.mockResolvedValue([]);

      await expect(
        service.getPostList(
          { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
          UserType.PARENT,
          'parent-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('학부모가 자녀가 있는 경우 정상적으로 목록을 조회해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      permissionService.getChildLinks.mockResolvedValue([
        { id: 'link-1', childId: 'child-1' },
      ]);
      permissionService.getParentEnrollmentIds.mockResolvedValue([
        'enrollment-1',
      ]);
      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.PARENT,
        'parent-1',
      );

      expect(permissionService.getChildLinks).toHaveBeenCalledWith('parent-1');
      expect(permissionService.getParentEnrollmentIds).toHaveBeenCalledWith(
        'parent-1',
      );
      expect(result.totalCount).toBe(1);
    });

    it('writerType이 STUDENT인 경우 학생이 작성한 질문만 필터링해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
        authorRole: AuthorRole.STUDENT,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.STUDENT },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          writerType: InquiryWriterType.STUDENT,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('writerType이 PARENT인 경우 학부모가 작성한 질문만 필터링해야 한다', async () => {
      studentPostsRepo.findMany.mockResolvedValue({
        posts: [],
        totalCount: 0,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.PARENT },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          writerType: InquiryWriterType.PARENT,
        }),
      );
      expect(result.totalCount).toBe(0);
    });

    it('writerType이 ALL인 경우 모든 질문을 반환해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        { page: 1, limit: 10, writerType: InquiryWriterType.ALL },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          writerType: InquiryWriterType.ALL,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('status 필터가 포함된 경우 정상적으로 목록을 반환해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
        status: StudentPostStatus.BEFORE,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        {
          page: 1,
          limit: 10,
          status: StudentPostStatus.BEFORE,
          writerType: InquiryWriterType.ALL,
        },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          status: StudentPostStatus.BEFORE,
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('검색어, 페이지네이션 필터가 포함된 경우 정상적으로 목록을 반환해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        {
          page: 2,
          limit: 5,
          search: '질문',
          writerType: InquiryWriterType.ALL,
        },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 5,
          search: '질문',
        }),
      );
      expect(result.totalCount).toBe(1);
    });

    it('모든 필터링 파라미터가 포함된 경우 정상적으로 목록을 반환해야 한다', async () => {
      const mockPost = mockStudentPost({
        id: 'post-1',
        enrollmentId: 'enrollment-1',
        instructorId: VALID_INSTRUCTOR_ID,
        status: StudentPostStatus.BEFORE,
        authorRole: AuthorRole.STUDENT,
      });

      studentPostsRepo.findMany.mockResolvedValue({
        posts: [mockPost],
        totalCount: 1,
      });

      const result = await service.getPostList(
        {
          page: 1,
          limit: 10,
          search: '검색어',
          lectureId: VALID_LECTURE_ID,
          status: StudentPostStatus.BEFORE,
          writerType: InquiryWriterType.STUDENT,
        },
        UserType.INSTRUCTOR,
        VALID_INSTRUCTOR_ID,
      );

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          limit: 10,
          search: '검색어',
          lectureId: VALID_LECTURE_ID,
          status: StudentPostStatus.BEFORE,
          writerType: InquiryWriterType.STUDENT,
        }),
      );
      expect(result.totalCount).toBe(1);
    });
  });

  describe('updatePost', () => {
    it.todo('학생이 본인의 질문을 수정하면 성공해야 한다');
    it.todo('학생이 타인의 질문을 수정하면 ForbiddenException을 던져야 한다');
    it.todo('강사가 학생의 질문을 수정하면 ForbiddenException을 던져야 한다');
    it.todo('존재하지 않는 질문 ID로 수정하면 NotFoundException을 던져야 한다');
    it.todo('이미 삭제된 질문을 수정하면 NotFoundException을 던져야 한다');
  });

  describe('createComment', () => {
    it.todo('학생이 본인의 질문에 댓글을 작성하면 성공해야 한다');
    it.todo('강사가 학생 질문에 댓글을 작성하면 성공해야 한다');
    it.todo('학부모가 질문에 댓글을 작성하면 ForbiddenException을 던져야 한다');
    it.todo(
      '존재하지 않는 질문에 댓글을 작성하면 NotFoundException을 던져야 한다',
    );
    it.todo('빈 내용으로 댓글을 작성하면 BadRequestException을 던져야 한다');
  });

  describe('deleteComment', () => {
    it.todo('학생이 본인의 댓글을 삭제하면 성공해야 한다');
    it.todo('강사가 본인의 댓글을 삭제하면 성공해야 한다');
    it.todo('학생이 타인의 댓글을 삭제하면 ForbiddenException을 던져야 한다');
    it.todo('강사가 타인의 댓글을 삭제하면 ForbiddenException을 던져야 한다');
    it.todo('학부모가 댓글을 삭제하면 ForbiddenException을 던져야 한다');
    it.todo('존재하지 않는 댓글을 삭제하면 NotFoundException을 던져야 한다');
  });

  describe('getComments', () => {
    it.todo('학생이 본인 질문의 댓글 목록을 조회하면 성공해야 한다');
    it.todo('강사가 담당 학생 질문의 댓글 목록을 조회하면 성공해야 한다');
    it.todo('학부모가 자녀 질문의 댓글 목록을 조회하면 성공해야 한다');
    it.todo(
      '권한이 없는 사용자가 댓글 목록을 조회하면 ForbiddenException을 던져야 한다',
    );
    it.todo(
      '존재하지 않는 질문의 댓글 목록을 조회하면 NotFoundException을 던져야 한다',
    );
  });

  describe('updatePostStatus', () => {
    it.todo('강사가 질문 상태를 해결됨으로 변경하면 성공해야 한다');
    it.todo('강사가 질문 상태를 대기중으로 변경하면 성공해야 한다');
    it.todo('학생이 질문 상태를 변경하면 ForbiddenException을 던져야 한다');
    it.todo('학부모가 질문 상태를 변경하면 ForbiddenException을 던져야 한다');
    it.todo(
      '존재하지 않는 질문의 상태를 변경하면 NotFoundException을 던져야 한다',
    );
    it.todo('잘못된 상태 값으로 변경하면 BadRequestException을 던져야 한다');
  });
});
