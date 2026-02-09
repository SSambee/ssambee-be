import { StudentPostsService } from './student-posts.service.js';
import {
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
} from '../test/mocks/repo.mock.js';
import { UserType } from '../constants/auth.constant.js';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';
import { mockStudentPosts } from '../test/fixtures/posts.fixture.js';
import { mockLectures } from '../test/fixtures/lectures.fixture.js';
import { AuthorRole, StudentPostStatus } from '../constants/posts.constant.js';
import type {
  CreateStudentPostDto,
  GetStudentPostsQueryDto,
} from '../validations/student-posts.validation.js';
import type { StudentPostsRepository } from '../repos/student-posts.repo.js';
import type { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import type { LecturesRepository } from '../repos/lectures.repo.js';
import type { LectureDetail } from '../repos/lectures.repo.js';
import type { Prisma } from '../generated/prisma/client.js';

/** 테스트에서 사용할 mock 데이터 타입 정의 */
type MockEnrollment = Pick<
  Prisma.EnrollmentGetPayload<object>,
  'id' | 'instructorId' | 'appStudentId'
>;

type MockLectureEnrollment = {
  enrollmentId: string;
  enrollment?: MockEnrollment;
};

type MockPostResponse = {
  posts: (typeof mockStudentPosts.basic)[];
  totalCount: number;
};

/** Enrollment 타입 (service에서 사용하는 형태) */
type EnrollmentWithAppStudentId = {
  id: string;
  instructorId: string;
  appStudentId: string | null;
};

describe('StudentPostsService', () => {
  let service: StudentPostsService;
  let studentPostsRepo: jest.Mocked<StudentPostsRepository>;
  let enrollmentsRepo: jest.Mocked<EnrollmentsRepository>;
  let lectureEnrollmentsRepo: jest.Mocked<LectureEnrollmentsRepository>;
  let lecturesRepo: jest.Mocked<LecturesRepository>;

  beforeEach(() => {
    // Initialize Auto-mocks
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    lecturesRepo = createMockLecturesRepository();

    // Initialize additional mocks requested by user
    // instructorPostsRepo = createMockInstructorPostsRepository();
    // prismaService = createMockPrisma();

    service = new StudentPostsService(
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      lecturesRepo,
    );
  });

  describe('createPost', () => {
    describe('학생(STUDENT) 권한', () => {
      it('강의 ID(lectureId)가 누락되면 BadRequestException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = { title: '제목', content: '내용' };
        await expect(
          service.createPost(data, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(BadRequestException);
      });

      it('존재하지 않는 강의 ID인 경우 NotFoundException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = {
          title: '제목',
          content: '내용',
          lectureId: 'invalid-lecture',
        };
        lecturesRepo.findById.mockResolvedValue(null);

        await expect(
          service.createPost(data, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(NotFoundException);
      });

      it('해당 강의를 수강하고 있지 않은 학생인 경우 ForbiddenException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = {
          title: '제목',
          content: '내용',
          lectureId: 'lecture-1',
        };
        lecturesRepo.findById.mockResolvedValue(
          mockLectures.basic as LectureDetail,
        );
        lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(
          null,
        );

        await expect(
          service.createPost(data, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('수강 정보(enrollment)를 찾을 수 없는 경우 NotFoundException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = {
          title: '제목',
          content: '내용',
          lectureId: 'lecture-1',
        };
        const mockLectureEnrollment: MockLectureEnrollment = {
          enrollmentId: 'enrollment-1',
        };
        lecturesRepo.findById.mockResolvedValue(
          mockLectures.basic as LectureDetail,
        );
        lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(
          mockLectureEnrollment,
        );
        enrollmentsRepo.findById.mockResolvedValue(null);

        await expect(
          service.createPost(data, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(NotFoundException);
      });

      it('모든 조건이 충족되면 성공적으로 질문을 생성하고 반환해야 한다', async () => {
        const data: CreateStudentPostDto = {
          title: '제목',
          content: '내용',
          lectureId: 'lecture-1',
        };
        const mockEnrollment: EnrollmentWithAppStudentId = {
          id: 'enrollment-1',
          instructorId: 'instructor-1',
          appStudentId: 'student-1',
        };
        const mockLectureEnrollment: MockLectureEnrollment = {
          enrollmentId: 'enrollment-1',
          enrollment: mockEnrollment,
        };
        const mockCreatedPost = mockStudentPosts.basic;

        lecturesRepo.findById.mockResolvedValue(
          mockLectures.basic as LectureDetail,
        );
        lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(
          mockLectureEnrollment,
        );
        enrollmentsRepo.findById.mockResolvedValue(mockEnrollment);
        studentPostsRepo.create.mockResolvedValue(mockCreatedPost);

        const result = await service.createPost(
          data,
          UserType.STUDENT,
          'student-1',
        );

        expect(result).toEqual(mockCreatedPost);
        expect(studentPostsRepo.create).toHaveBeenCalledWith({
          title: data.title,
          content: data.content,
          status: StudentPostStatus.PENDING,
          enrollmentId: mockEnrollment.id,
          authorRole: AuthorRole.STUDENT,
          instructorId: mockEnrollment.instructorId,
          lectureId: data.lectureId,
        });
      });
    });

    describe('학부모(PARENT) 권한', () => {
      it('현재 학부모 질문 작성은 지원되지 않으므로 BadRequestException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = { title: '제목', content: '내용' };
        await expect(
          service.createPost(data, UserType.PARENT, 'parent-1'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('기타 권한', () => {
      it('강사나 관리자 등 질문 작성 권한이 없는 사용자는 ForbiddenException을 던져야 한다', async () => {
        const data: CreateStudentPostDto = { title: '제목', content: '내용' };
        await expect(
          service.createPost(data, UserType.ASSISTANT, 'assistant-1'),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('getPostList', () => {
    it('강사가 조회하는 경우 본인(instructorId)의 질문 목록을 반환해야 한다', async () => {
      const query: GetStudentPostsQueryDto = { page: 1, limit: 10 };
      const profileId = 'instructor-1';
      const mockResponse: MockPostResponse = {
        posts: [mockStudentPosts.basic],
        totalCount: 1,
      };
      studentPostsRepo.findMany.mockResolvedValue(mockResponse);

      const result = await service.getPostList(
        query,
        UserType.INSTRUCTOR,
        profileId,
      );

      expect(result).toEqual(mockResponse);
      expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
        ...query,
        instructorId: profileId,
        appStudentId: undefined,
      });
    });

    it('학생이 조회하는 경우 본인(appStudentId)의 질문 목록을 반환해야 한다', async () => {
      const query: GetStudentPostsQueryDto = { page: 1, limit: 10 };
      const profileId = 'student-1';
      const mockResponse: MockPostResponse = {
        posts: [mockStudentPosts.basic],
        totalCount: 1,
      };
      studentPostsRepo.findMany.mockResolvedValue(mockResponse);

      const result = await service.getPostList(
        query,
        UserType.STUDENT,
        profileId,
      );

      expect(result).toEqual(mockResponse);
      expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
        ...query,
        instructorId: undefined,
        appStudentId: profileId,
      });
    });

    it('검색어, 상태 필터링 및 페이지네이션이 정상적으로 적용되어야 한다', async () => {
      const query: GetStudentPostsQueryDto = {
        page: 2,
        limit: 5,
        search: '검색',
        status: StudentPostStatus.PENDING,
      };
      const mockResponse: MockPostResponse = { posts: [], totalCount: 0 };
      studentPostsRepo.findMany.mockResolvedValue(mockResponse);

      await service.getPostList(query, UserType.INSTRUCTOR, 'instructor-1');

      expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
        ...query,
        instructorId: 'instructor-1',
        appStudentId: undefined,
      });
    });
  });

  describe('getPostDetail', () => {
    it('존재하지 않는 질문 ID인 경우 NotFoundException을 던져야 한다', async () => {
      studentPostsRepo.findById.mockResolvedValue(null);
      await expect(
        service.getPostDetail('invalid-id', UserType.STUDENT, 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    describe('권한 검증', () => {
      it('학생이 본인의 질문이 아닌 것을 상세 조회하려고 하면 ForbiddenException을 던져야 한다', async () => {
        const post = mockStudentPosts.basic;
        const otherEnrollment: EnrollmentWithAppStudentId = {
          id: post.enrollmentId,
          instructorId: 'instructor-1',
          appStudentId: 'other-student',
        };
        studentPostsRepo.findById.mockResolvedValue(post);
        enrollmentsRepo.findById.mockResolvedValue(otherEnrollment);

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('학생이 본인의 질문을 상세 조회하는 경우 정보를 반환해야 한다', async () => {
        const post = mockStudentPosts.basic;
        const myEnrollment: EnrollmentWithAppStudentId = {
          id: post.enrollmentId,
          instructorId: 'instructor-1',
          appStudentId: 'student-1',
        };
        studentPostsRepo.findById.mockResolvedValue(post);
        enrollmentsRepo.findById.mockResolvedValue(myEnrollment);

        const result = await service.getPostDetail(
          post.id,
          UserType.STUDENT,
          'student-1',
        );

        expect(result).toEqual(post);
      });

      it('강사가 본인이 담당하지 않는 학생의 질문을 조회하려고 하면 ForbiddenException을 던져야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'other-instructor',
        };
        studentPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.getPostDetail(post.id, UserType.INSTRUCTOR, 'instructor-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('강사가 담당 학생의 질문을 상세 조회하는 경우 정보를 반환해야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'instructor-1',
        };
        studentPostsRepo.findById.mockResolvedValue(post);

        const result = await service.getPostDetail(
          post.id,
          UserType.INSTRUCTOR,
          'instructor-1',
        );

        expect(result).toEqual(post);
      });
    });
  });

  describe('updateStatus', () => {
    it('존재하지 않는 질문 ID인 경우 NotFoundException을 던져야 한다', async () => {
      studentPostsRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateStatus(
          'invalid-id',
          StudentPostStatus.RESOLVED,
          UserType.INSTRUCTOR,
          'instructor-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    describe('권한 검증', () => {
      it('강사가 본인이 담당하지 않는 학생의 질문 상태를 변경하려고 하면 ForbiddenException을 던져야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'other-instructor',
        };
        studentPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.updateStatus(
            post.id,
            StudentPostStatus.RESOLVED,
            UserType.INSTRUCTOR,
            'instructor-1',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('학생이 본인의 질문이 아닌 것의 상태를 변경하려고 하면 ForbiddenException을 던져야 한다', async () => {
        const post = mockStudentPosts.basic;
        const otherEnrollment: EnrollmentWithAppStudentId = {
          id: post.enrollmentId,
          instructorId: 'instructor-1',
          appStudentId: 'other-student',
        };
        studentPostsRepo.findById.mockResolvedValue(post);
        enrollmentsRepo.findById.mockResolvedValue(otherEnrollment);

        await expect(
          service.updateStatus(
            post.id,
            StudentPostStatus.RESOLVED,
            UserType.STUDENT,
            'student-1',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('권한이 있는 사용자가 상태를 변경하면 성공적으로 업데이트하고 질문 정보를 반환해야 한다', async () => {
        const post = mockStudentPosts.basic;
        const myEnrollment: EnrollmentWithAppStudentId = {
          id: post.enrollmentId,
          instructorId: 'instructor-1',
          appStudentId: 'student-1',
        };
        const updatedPost = {
          ...post,
          status: StudentPostStatus.RESOLVED as StudentPostStatus,
        };
        studentPostsRepo.findById.mockResolvedValue(post);
        enrollmentsRepo.findById.mockResolvedValue(myEnrollment);
        studentPostsRepo.updateStatus.mockResolvedValue(updatedPost);

        const result = await service.updateStatus(
          post.id,
          StudentPostStatus.RESOLVED,
          UserType.STUDENT,
          'student-1',
        );

        expect(result.status).toBe(StudentPostStatus.RESOLVED);
        expect(studentPostsRepo.updateStatus).toHaveBeenCalledWith(
          post.id,
          StudentPostStatus.RESOLVED,
        );
      });
    });

    describe('강사가 질문을 답변 완료(RESOLVED) 상태로 변경', () => {
      it('강사가 자신이 담당하는 강의의 질문을 답변 완료 처리할 수 있어야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'instructor-1',
          status: StudentPostStatus.PENDING,
        };
        const resolvedPost = { ...post, status: StudentPostStatus.RESOLVED };
        studentPostsRepo.findById.mockResolvedValue(post);
        studentPostsRepo.updateStatus.mockResolvedValue(resolvedPost);

        const result = await service.updateStatus(
          post.id,
          StudentPostStatus.RESOLVED,
          UserType.INSTRUCTOR,
          'instructor-1',
        );

        expect(result.status).toBe(StudentPostStatus.RESOLVED);
        expect(studentPostsRepo.updateStatus).toHaveBeenCalledWith(
          post.id,
          StudentPostStatus.RESOLVED,
        );
      });

      it('강사가 자신이 담당하지 않는 강의의 질문을 답변 완료 처리하려고 하면 ForbiddenException이 발생해야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'other-instructor',
        };
        studentPostsRepo.findById.mockResolvedValue(post);

        await expect(
          service.updateStatus(
            post.id,
            StudentPostStatus.RESOLVED,
            UserType.INSTRUCTOR,
            'instructor-1',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('존재하지 않는 질문 ID에 대해 답변 완료 처리를 시도하면 NotFoundException이 발생해야 한다', async () => {
        studentPostsRepo.findById.mockResolvedValue(null);

        await expect(
          service.updateStatus(
            'invalid-id',
            StudentPostStatus.RESOLVED,
            UserType.INSTRUCTOR,
            'instructor-1',
          ),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('강사가 답변 완료(RESOLVED) 상태를 취소(PENDING으로 되돌리기)', () => {
      it('이미 답변 완료된(RESOLVED) 질문을 다시 대기 중(PENDING) 상태로 되돌릴 수 있어야 한다 (토글 기능)', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'instructor-1',
          status: StudentPostStatus.RESOLVED,
        };
        const pendingPost = { ...post, status: StudentPostStatus.PENDING };
        studentPostsRepo.findById.mockResolvedValue(post);
        studentPostsRepo.updateStatus.mockResolvedValue(pendingPost);

        const result = await service.updateStatus(
          post.id,
          StudentPostStatus.PENDING,
          UserType.INSTRUCTOR,
          'instructor-1',
        );

        expect(result.status).toBe(StudentPostStatus.PENDING);
        expect(studentPostsRepo.updateStatus).toHaveBeenCalledWith(
          post.id,
          StudentPostStatus.PENDING,
        );
      });

      it('강사가 아닌 학생은 RESOLVED 상태를 다시 PENDING으로 되돌릴 수 없어야 한다', async () => {
        const post = {
          ...mockStudentPosts.basic,
          instructorId: 'instructor-1',
          status: StudentPostStatus.RESOLVED,
        };
        const myEnrollment: EnrollmentWithAppStudentId = {
          id: post.enrollmentId,
          instructorId: 'instructor-1',
          appStudentId: 'student-1',
        };
        studentPostsRepo.findById.mockResolvedValue(post);
        enrollmentsRepo.findById.mockResolvedValue(myEnrollment);

        await expect(
          service.updateStatus(
            post.id,
            StudentPostStatus.PENDING,
            UserType.STUDENT,
            'student-1',
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
