import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import {
  CreateStudentPostDto,
  GetStudentPostsQueryDto,
} from '../validations/student-posts.validation.js';
import { StudentPostStatus, AuthorRole } from '../constants/posts.constant.js';
import { UserType } from '../constants/auth.constant.js';
import { StudentPostsRepository } from '../repos/student-posts.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { CommentsRepository } from '../repos/comments.repo.js';

export class StudentPostsService {
  constructor(
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly commentsRepository: CommentsRepository,
  ) {}

  /** 질문 생성 (학생/학부모) */
  async createPost(
    data: CreateStudentPostDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Enrollment 식별
    let enrollmentId = '';
    let authorRole = AuthorRole.STUDENT;

    // 질문은 'Enrollment(학생-강사 관계)'에 귀속됨
    // lectureId가 있으면 해당 강의의 enrollment를 찾음
    if (userType === UserType.STUDENT) {
      if (data.lectureId) {
        const lecture = await this.lecturesRepository.findById(data.lectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            data.lectureId,
            profileId,
          );
        if (!enrollment)
          throw new ForbiddenException('해당 강의를 수강하고 있지 않습니다.');

        enrollmentId = enrollment.enrollmentId;
      } else {
        throw new BadRequestException('강의 ID는 필수입니다.');
      }
      authorRole = AuthorRole.STUDENT;
    } else if (userType === UserType.PARENT) {
      // TODO: 학부모 질문 작성 - 자녀 선택 후 enrollment 조회 로직 필요
      throw new BadRequestException(
        '학부모 질문 작성은 아직 지원되지 않습니다.',
      );
    } else {
      throw new ForbiddenException('질문 작성 권한이 없습니다.');
    }

    // Enrollment에서 강사 ID 추출
    const enrollment = await this.enrollmentsRepository.findById(enrollmentId);
    if (!enrollment)
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');

    return this.studentPostsRepository.create({
      title: data.title,
      content: data.content,
      status: StudentPostStatus.PENDING,
      enrollmentId,
      authorRole,
      instructorId: enrollment.instructorId,
      lectureId: data.lectureId || null,
    });
  }

  /** 질문 목록 조회 */
  async getPostList(
    query: GetStudentPostsQueryDto,
    userType: UserType,
    profileId: string,
  ) {
    let instructorId: string | undefined;
    let appStudentId: string | undefined;

    if (userType === UserType.INSTRUCTOR) {
      instructorId = profileId;
    } else if (userType === UserType.STUDENT) {
      appStudentId = profileId;
    } else if (userType === UserType.ASSISTANT) {
      throw new ForbiddenException('조교 권한 검증이 구현되지 않았습니다.');
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return this.studentPostsRepository.findMany({
      ...query,
      instructorId,
      appStudentId,
    });
  }

  /** 질문 상세 조회 */
  async getPostDetail(postId: string, userType: UserType, profileId: string) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    // 권한 검증
    if (userType === UserType.STUDENT) {
      // 본인 확인
      if (post.enrollment?.appStudent?.user?.name) {
        const enrollment = await this.enrollmentsRepository.findById(
          post.enrollmentId,
        );
        if (enrollment?.appStudentId !== profileId) {
          throw new ForbiddenException('본인의 질문만 조회할 수 있습니다.');
        }
      }
    } else if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('권한이 없습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      // TODO: 조교 권한 확인 구현 필요
    }

    return post;
  }

  /** 상태 변경 */
  async updateStatus(
    postId: string,
    status: string,
    userType: UserType,
    profileId: string,
  ) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    // 권한: 담당 강사/조교 또는 질문 작성자(해결됨 처리)
    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId)
        throw new ForbiddenException('권한이 없습니다.');
    } else if (userType === UserType.ASSISTANT) {
      // TODO: PermissionService 통합 후 getInstructorIdByAssistantId 사용
      throw new ForbiddenException('조교 권한 검증이 구현되지 않았습니다.');
    } else if (userType === UserType.STUDENT) {
      // 본인 글인지 확인
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId)
        throw new ForbiddenException('권한이 없습니다.');

      // 학생은 해결됨(RESOLVED)으로만 변경 가능
      if (status === StudentPostStatus.PENDING) {
        throw new ForbiddenException(
          '학생은 질문을 다시 대기 중 상태로 변경할 수 없습니다.',
        );
      }
    }

    return this.studentPostsRepository.updateStatus(postId, status);
  }

  /** 댓글 수정 */
  async updateComment(
    commentId: string,
    content: string,
    userType: UserType,
    profileId: string,
  ) {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    // 권한 검증
    if (userType === UserType.STUDENT) {
      if (!comment.enrollmentId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
      const enrollment = await this.enrollmentsRepository.findById(
        comment.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.INSTRUCTOR) {
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 수정 권한이 없습니다.');
    }

    return this.commentsRepository.update(commentId, { content });
  }
}
