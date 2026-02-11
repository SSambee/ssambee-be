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
import { PermissionService } from './permission.service.js';
import { StudentPost, Comment } from '../generated/prisma/client.js';

export class StudentPostsService {
  constructor(
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly commentsRepository: CommentsRepository,
    private readonly permissionService: PermissionService,
  ) {}

  /** 질문 생성 (학생/학부모) */
  async createPost(
    data: CreateStudentPostDto,
    userType: UserType,
    profileId: string,
  ) {
    let enrollmentId = '';
    let authorRole = AuthorRole.STUDENT;

    if (userType === UserType.STUDENT) {
      enrollmentId = await this.getStudentEnrollmentForPost(
        data.lectureId,
        profileId,
      );
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
      const id = await this.permissionService.getEffectiveInstructorId(
        userType,
        profileId,
      );
      if (!id) throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
      instructorId = id;
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
    await this.validatePostAccess(post, userType, profileId);

    // 학생용 댓글 첨부파일 필터링
    if (userType === UserType.STUDENT && post.comments) {
      const filteredComments = await this.processPostComments(
        post,
        userType,
        profileId,
      );

      return {
        ...post,
        comments: filteredComments,
      };
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

    // 권한 검증
    await this.validatePostAccess(post, userType, profileId);

    // 상태 변경 유효성 검사 (학생은 해결됨으로만 변경 가능)
    if (userType === UserType.STUDENT && status !== StudentPostStatus.PENDING) {
      // NOTE: validatePostAccess에서 이미 학생 권한 체크를 했지만,
      // 상태 변경에 대한 추가적인 제약사항이 있다면 여기서 처리
      // 특정 상태로의 변경 제약은 비즈니스 로직으로 남겨둡니다.
      throw new ForbiddenException(
        '학생은 해결됨 상태로만 변경할 수 있습니다.',
      );
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

    await this.validateCommentAccess(comment, userType, profileId);

    return this.commentsRepository.update(commentId, { content });
  }

  /** 질문 수정 (본인만 가능) */
  async updatePost(
    postId: string,
    data: { title?: string; content?: string },
    userType: UserType,
    profileId: string,
  ) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    await this.validatePostAccess(post, userType, profileId);

    if (!data.title && !data.content) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }

    const isRedundant =
      (data.title === undefined || data.title === post.title) &&
      (data.content === undefined || data.content === post.content);

    if (isRedundant) {
      return post;
    }

    return this.studentPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
    });
  }

  /** 질문 삭제 (본인만 가능) */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    await this.validatePostAccess(post, userType, profileId);

    return this.studentPostsRepository.delete(postId);
  }

  // ----------------------------------------------------------------
  // Private Helper Methods
  // ----------------------------------------------------------------

  /** 게시글 접근 권한 검증 Helper */
  private async validatePostAccess(
    post: StudentPost,
    userType: UserType,
    profileId: string,
  ) {
    if (userType === UserType.STUDENT) {
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('권한이 없습니다.');
      }
      return;
    }

    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('권한이 없습니다.');
      }
      return;
    }

    if (userType === UserType.ASSISTANT) {
      const instructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
      if (instructorId !== post.instructorId) {
        throw new ForbiddenException('권한이 없습니다.');
      }
      return;
    }

    if (userType === UserType.PARENT) {
      // TODO: 학부모 권한 검증 로직
      throw new ForbiddenException('학부모 권한 검증이 구현되지 않았습니다.');
    }

    throw new ForbiddenException('접근 권한이 없습니다.');
  }

  /** 댓글 접근 권한 검증 Helper */
  private async validateCommentAccess(
    comment: Comment,
    userType: UserType,
    profileId: string,
  ) {
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
      return;
    }

    if (userType === UserType.INSTRUCTOR) {
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
      return;
    }

    if (userType === UserType.PARENT) {
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    }

    throw new ForbiddenException('댓글 수정 권한이 없습니다.');
  }

  /** 학생 질문 작성을 위한 Enrollment ID 조회 Helper */
  private async getStudentEnrollmentForPost(
    lectureId: string | undefined,
    profileId: string,
  ): Promise<string> {
    if (!lectureId) {
      throw new BadRequestException('강의 ID는 필수입니다.');
    }

    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    const enrollment =
      await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
        lectureId,
        profileId,
      );

    if (!enrollment) {
      throw new ForbiddenException('해당 강의를 수강하고 있지 않습니다.');
    }

    return enrollment.enrollmentId;
  }

  private async processPostComments(
    post: NonNullable<Awaited<ReturnType<StudentPostsRepository['findById']>>>,
    userType: UserType,
    profileId: string,
  ) {
    if (!post.comments) return [];

    return Promise.all(
      post.comments.map(async (comment) => {
        const accessibleAttachments = await this.filterAccessibleAttachments(
          comment.attachments,
          profileId,
        );
        return {
          ...comment,
          attachments: accessibleAttachments,
        };
      }),
    );
  }

  /** 학생용 첨부파일 접근 권한 필터링 */
  private async filterAccessibleAttachments(
    attachments: Array<{
      materialId: string | null;
      material: {
        id: string;
        instructorId: string;
        lectureId: string | null;
      } | null;
    }>,
    profileId: string,
  ): Promise<
    Array<{
      materialId: string | null;
      material: {
        id: string;
        instructorId: string;
        lectureId: string | null;
      } | null;
    }>
  > {
    if (!attachments || attachments.length === 0) return [];

    const result: typeof attachments = [];

    for (const attachment of attachments) {
      const material = attachment.material;
      if (!material) {
        continue;
      }

      // 강의 자료인 경우: 해당 강의 수강 여부 확인
      if (material.lectureId) {
        const isEnrolled =
          await this.lectureEnrollmentsRepository.existsByLectureIdAndStudentId(
            material.lectureId,
            profileId,
          );
        if (!isEnrolled) {
          continue;
        }
      } else {
        // 라이브러리 자료인 경우: 해당 강사의 수강생인지 확인
        const enrollment =
          await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
            material.instructorId,
            profileId,
          );
        if (!enrollment) {
          continue;
        }
      }

      result.push(attachment);
    }

    return result;
  }
}
