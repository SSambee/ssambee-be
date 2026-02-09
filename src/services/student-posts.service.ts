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

    // 강의 ID가 주어졌을 때 해당 강의의 enrollment를 찾아야 함
    // (학생은 lectureEnrollment가 아니라 부모 Enrollment에 연결된 구조일 수 있음)
    // 기획상: 질문은 "강사(Enrollment)"에게 하거나 "강의(Lecture)"에 대해 할 수 있음.
    // 여기서는 data.enrollmentId(강사와의 관계)를 직접 받는다고 가정하거나,
    // lectureId를 통해 enrollment를 추론해야 함.

    // 단순화를 위해 data에 enrollmentId(학생-강사 관계 ID)가 포함된다고 가정
    // 또는 lectureId가 있으면 해당 lecture의 강사와의 관계를 찾음

    if (userType === UserType.STUDENT) {
      // 학생 본인의 Enrollment 확인
      // 만약 data.lectureId가 있다면
      if (data.lectureId) {
        // 강의가 존재하는지 확인
        const lecture = await this.lecturesRepository.findById(data.lectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            data.lectureId,
            profileId,
          );
        if (!enrollment)
          throw new ForbiddenException('해당 강의를 수강하고 있지 않습니다.');
        // 질문은 'Enrollment(학생-강사 관계)'에 귀속되므로 parent enrollment id 사용
        enrollmentId = enrollment.enrollmentId;
      } else {
        // lectureId 없이 특정 강사에게 질문하는 경우? (기획 확인 필요)
        // 여기서는 lectureId 필수라고 가정하거나, enrollmentId를 직접 받는다고 가정
        throw new BadRequestException('강의 ID는 필수입니다.');
      }
      authorRole = AuthorRole.STUDENT;
    } else if (userType === UserType.PARENT) {
      // 학부모: 자녀의 Enrollment 확인
      // 복잡하므로 일단 STUDENT 구현 위주로
      // 학부모 -> 자녀 선택 -> 자녀의 Enrollment ID 조회 로직 필요
      throw new BadRequestException(
        '학부모 질문 작성은 아직 지원되지 않습니다.',
      );
    } else {
      throw new ForbiddenException('질문 작성 권한이 없습니다.');
    }

    // 강사 ID 추출 (Enrollment에서)
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
    // 권한에 따른 필터링
    let instructorId: string | undefined;
    let appStudentId: string | undefined;

    if (userType === UserType.INSTRUCTOR) {
      instructorId = profileId;
    } else if (userType === UserType.STUDENT) {
      appStudentId = profileId;
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
      // 본인 확인 (Enrollment의 appStudentId 확인)
      if (post.enrollment?.appStudent?.user?.name) {
        // Repository findById includes: enrollment: { select: { appStudent: { select: { user: { select: { name: true } } } } } }
        // We don't have appStudentId in the include.
        // We need to fetch appStudentId to verify.
        // Let's use database query for enrollment if ID check fails?
        // Actually, StudentPostsRepository.findById DOES NOT include appStudentId in the current select.
        // It only validates if we fetch it.
        // Ideally, we should update the repository to include `appStudentId` in the enrollment include.

        // However, we can use EnrollmentsRepo to check ownership if needed.
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
      // 조교 권한 확인 등
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
      // 조교 권한 확인: 담당 강사의 질문인지 확인
      // PermissionService를 사용하여 조교가 해당 강사의 조교인지 확인
      // 현재 StudentPostsService에 PermissionService가 없으므로 기본 체크만 수행
      // TODO: PermissionService 추가 후 getInstructorIdByAssistantId 사용
      // 일단은 조교도 instructorId 매칭으로 간단히 처리 (실제로는 별도 검증 필요)
      throw new ForbiddenException(
        '조교 권한 검증이 구현되지 않았습니다. PermissionService 통합이 필요합니다.',
      );
    } else if (userType === UserType.STUDENT) {
      // 본인 글인지 확인 (Enrollment -> AppStudent 매칭 필요)
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId)
        throw new ForbiddenException('권한이 없습니다.');

      // 학생은 해결됨(RESOLVED)으로만 변경 가능, 다시 PENDING으로는 불가
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
      // 학생: Enrollment의 appStudentId로 본인 확인
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
      // 강사: instructorId로 본인 확인
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // 학부모: 현재는 댓글 수정 권한 없음
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 수정 권한이 없습니다.');
    }

    return this.commentsRepository.update(commentId, { content });
  }
}
