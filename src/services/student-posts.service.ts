import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import {
  CreateStudentPostDto,
  GetStudentPostsQueryDto,
  GetMyLecturesQueryDto,
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
import { formatStudentPostStats } from '../utils/posts.util.js';
import { CommentsService } from './comments.service.js';

export class StudentPostsService {
  constructor(
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly commentsRepository: CommentsRepository,
    private readonly permissionService: PermissionService,
    private readonly commentsService: CommentsService,
  ) {}

  /** 질문 생성 (학생/학부모) */
  async createPost(
    data: CreateStudentPostDto & { childLinkId?: string }, // [NEW] 학부모용
    userType: UserType,
    profileId: string,
  ) {
    let enrollmentId = '';
    let authorRole: string = AuthorRole.STUDENT;

    if (userType === UserType.STUDENT) {
      enrollmentId = await this.getStudentEnrollmentForPost(
        data.lectureId,
        profileId,
      );
      authorRole = AuthorRole.STUDENT;
    } else if (userType === UserType.PARENT) {
      // [NEW] 학부모 질문 작성
      if (!data.childLinkId) {
        throw new BadRequestException('자녀 선택이 필요합니다.');
      }

      // 자녀 접근 권한 확인
      const childLink = await this.permissionService.validateChildAccess(
        userType,
        profileId,
        data.childLinkId,
      );

      // 자녀의 enrollment 조회
      enrollmentId = await this.getParentEnrollmentForPost(
        data.lectureId,
        childLink.phoneNumber,
      );

      authorRole = AuthorRole.PARENT;
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
      status: StudentPostStatus.BEFORE,
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
    let enrollmentIds: string[] | undefined; // [NEW] 학부모용

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
    } else if (userType === UserType.PARENT) {
      // [NEW] 학부모: 등록된 자녀 링크 확인
      const childLinks = await this.permissionService.getChildLinks(profileId);

      if (!childLinks || childLinks.length === 0) {
        throw new NotFoundException('등록된 자녀가 없습니다.');
      }

      // [NEW] 학부모: 모든 자녀의 enrollment ID 조회
      enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);

      if (!enrollmentIds || enrollmentIds.length === 0) {
        // 자녀는 있지만 수강 중인 강의가 없는 경우 빈 목록 반환
        return {
          posts: [],
          totalCount: 0,
          stats: null,
        };
      }
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    const result = await this.studentPostsRepository.findMany({
      ...query,
      instructorId,
      appStudentId,
      enrollmentIds, // [NEW] 학부모용
    });

    // [Stats] 학생 질문 통계 추가 (강사/조교인 경우)
    // DRY: formatStudentPostStats 헬퍼 함수 사용 - instructor-posts.service.ts와 동일 로직 공유
    let stats = null;
    if (instructorId) {
      const statsRaw = await this.studentPostsRepository.getStats(instructorId);
      stats = formatStudentPostStats(statsRaw);
    }

    return {
      ...result,
      stats,
    };
  }

  /** 내 수강 강의 목록 조회 */
  async getMyLectures(
    query: GetMyLecturesQueryDto,
    userType: UserType,
    profileId: string,
  ) {
    // 학생과 학부모만 접근 가능
    if (userType !== UserType.STUDENT && userType !== UserType.PARENT) {
      throw new ForbiddenException('학생 또는 학부모만 접근할 수 있습니다.');
    }

    const { page, limit } = query;
    const offset = (page - 1) * limit;

    // 학부모인 경우 자녀의 수강 목록 조회
    if (userType === UserType.PARENT) {
      const childLinks = await this.permissionService.getChildLinks(profileId);
      if (!childLinks || childLinks.length === 0) {
        return { lectures: [], totalCount: 0 };
      }

      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);
      if (!enrollmentIds || enrollmentIds.length === 0) {
        return { lectures: [], totalCount: 0 };
      }

      const result =
        await this.lectureEnrollmentsRepository.findManyByEnrollmentIds(
          enrollmentIds,
        );

      // 페이지네이션 적용
      const paginatedResult = result.slice(offset, offset + limit);

      return {
        lectures: paginatedResult.map((le) => ({
          id: le.lecture.id,
          title: le.lecture.title,
          instructorId: le.lecture.instructorId,
        })),
        totalCount: result.length,
      };
    }

    // 학생인 경우
    const { lectureEnrollments, totalCount } =
      await this.lectureEnrollmentsRepository.findManyByAppStudentId(
        profileId,
        { limit, offset },
      );

    return {
      lectures: lectureEnrollments.map((le) => ({
        id: le.lecture.id,
        title: le.lecture.title,
        instructorId: le.lecture.instructorId,
        lectureTimes: le.lecture.lectureTimes,
      })),
      totalCount,
    };
  }

  /** 질문 상세 조회 */
  async getPostDetail(postId: string, userType: UserType, profileId: string) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    // 권한 검증
    await this.validatePostAccess(post, userType, profileId);

    // 댓글에 isMine 및 첨부파일 필터링 적용
    if (post.comments) {
      const processedComments = await this.processPostComments(
        post,
        userType,
        profileId,
      );

      return {
        ...post,
        comments: processedComments,
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

    // 강사는 상태를 변경할 수 없음 (댓글만 작성 가능)
    if (userType === UserType.INSTRUCTOR) {
      throw new ForbiddenException(
        '강사는 질문의 완료 상태를 변경할 수 없습니다. 학생이 완료 처리해야 합니다.',
      );
    }

    // 학부모인 경우 본인이 작성한 질문만 상태 변경 가능
    if (userType === UserType.PARENT && post.authorRole !== AuthorRole.PARENT) {
      throw new ForbiddenException(
        '본인이 작성한 질문만 상태를 변경할 수 있습니다.',
      );
    }

    // 학생/학부모: RESOLVED ↔ COMPLETED 토글만 허용
    if (userType === UserType.STUDENT || userType === UserType.PARENT) {
      // 댓글이 없으면 상태 변경 불가 (답변이 없는 질문은 완료 처리 불가)
      const commentCount = post.comments?.length ?? 0;
      if (commentCount === 0) {
        throw new BadRequestException(
          '답변이 없는 질문은 완료 처리할 수 없습니다.',
        );
      }

      // BEFORE 상태에서는 직접 COMPLETED로 변경 불가 (강사가 먼저 REGISTERED로 변경해야 함)
      if (post.status === StudentPostStatus.BEFORE) {
        throw new BadRequestException('아직 답변이 등록되지 않은 질문입니다.');
      }

      // REGISTERED ↔ COMPLETED 토글만 허용
      if (
        status !== StudentPostStatus.REGISTERED &&
        status !== StudentPostStatus.COMPLETED
      ) {
        throw new ForbiddenException(
          '답변 완료(COMPLETED) 또는 답변 등록(REGISTERED) 상태로만 변경할 수 있습니다.',
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

    // 학부모인 경우 본인이 작성한 질문만 수정 가능
    if (userType === UserType.PARENT && post.authorRole !== AuthorRole.PARENT) {
      throw new ForbiddenException('본인이 작성한 질문만 수정할 수 있습니다.');
    }

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

    // 학부모인 경우 본인이 작성한 질문만 삭제 가능
    if (userType === UserType.PARENT && post.authorRole !== AuthorRole.PARENT) {
      throw new ForbiddenException('본인이 작성한 질문만 삭제할 수 있습니다.');
    }

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
      // [NEW] 학부모 조회 권한 검증 (자녀의 질문도 조회 가능)
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );

      if (!enrollment?.appParentLinkId) {
        throw new ForbiddenException('학부모 연결 정보가 없습니다.');
      }

      // 본인 자녀의 질문인지 확인 (조회용)
      await this.permissionService.validateChildAccess(
        userType,
        profileId,
        enrollment.appParentLinkId,
      );

      return;
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

  /** [NEW] 학부모 질문 작성을 위한 Enrollment ID 조회 Helper */
  private async getParentEnrollmentForPost(
    lectureId: string | undefined,
    childPhoneNumber: string,
  ): Promise<string> {
    if (!lectureId) {
      throw new BadRequestException('강의 ID는 필수입니다.');
    }

    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    // 자녀 전화번호로 해당 강의의 enrollment 조회
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findByLectureIdAndStudentPhone(
        lectureId,
        childPhoneNumber,
      );

    if (!lectureEnrollment) {
      throw new ForbiddenException(
        '자녀가 해당 강의를 수강하고 있지 않습니다.',
      );
    }

    return lectureEnrollment.enrollmentId;
  }

  private async processPostComments(
    post: NonNullable<Awaited<ReturnType<StudentPostsRepository['findById']>>>,
    userType: UserType,
    profileId: string,
  ) {
    if (!post.comments) return [];

    return Promise.all(
      post.comments.map(async (comment) => {
        // isMine 필드 추가
        const commentWithIsMine = this.commentsService.addIsMineFieldToComment(
          comment,
          userType,
          profileId,
        );

        // 학생인 경우 첨부파일 필터링
        if (userType === UserType.STUDENT) {
          const accessibleAttachments = await this.filterAccessibleAttachments(
            comment.attachments,
            profileId,
          );
          return {
            ...commentWithIsMine,

            attachments: accessibleAttachments,
          };
        }

        return commentWithIsMine;
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

  /** 만료된 질문 자동 완료 처리 (배치용) */
  async autoCompleteExpiredPosts(expiresInDays: number = 7): Promise<number> {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() - expiresInDays);

    // 만료된 PENDING 질문 조회
    const expiredPosts =
      await this.studentPostsRepository.findManyPendingExpired(expirationDate);

    if (expiredPosts.length === 0) {
      return 0;
    }

    // 일괄 완료 처리
    const result = await this.studentPostsRepository.updateManyStatus(
      expiredPosts.map((p) => p.id),
      StudentPostStatus.COMPLETED,
    );

    console.log(
      `[StudentPostsService] ${expiredPosts.length}개의 만료된 질문이 자동 완료 처리되었습니다.`,
    );

    return result.count;
  }
}
