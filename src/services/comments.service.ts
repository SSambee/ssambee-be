import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { UserType } from '../constants/auth.constant.js';
import { CommentsRepository } from '../repos/comments.repo.js';
import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { StudentPostsRepository } from '../repos/student-posts.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { PermissionService } from './permission.service.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import { Comment } from '../generated/prisma/client.js';
import {
  CreateCommentDto,
  UpdateCommentDto,
} from '../validations/comments.validation.js';
import { StudentPostStatus, AuthorRole } from '../constants/posts.constant.js';

export interface CommentMinimal {
  enrollmentId?: string | null;
  enrollment?: {
    appStudentId?: string | null;
    appParentLink?: {
      appParentId?: string | null;
    } | null;
  } | null;
  instructorId?: string | null;
  assistantId?: string | null;
  authorRole?: string | null;
}

export class CommentsService {
  constructor(
    private readonly commentsRepository: CommentsRepository,
    private readonly instructorPostsRepository: InstructorPostsRepository,
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly permissionService: PermissionService,
    private readonly parentChildLinkRepository: ParentChildLinkRepository,
  ) {}

  /** 댓글 및 게시글 연관성 검증 및 게시글 접근 권한 확인 */
  private async validateAndGetComment(
    commentId: string,
    postId: string,
    postType: 'instructorPost' | 'studentPost',
    userType: UserType,
    profileId: string,
  ) {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    const postIdField =
      postType === 'instructorPost'
        ? comment.instructorPostId
        : comment.studentPostId;

    if (postIdField !== postId) {
      throw new NotFoundException('해당 게시글에서 댓글을 찾을 수 없습니다.');
    }

    // 게시글 접근 권한 검증 (IDOR 방지)
    if (postType === 'instructorPost') {
      const post = await this.instructorPostsRepository.findById(postId);
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      // 강사/조교: 담당 강사의 글인지 확인
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        await this.permissionService.validateInstructorAccess(
          post.instructorId,
          userType,
          profileId,
        );
      } else if (userType === UserType.STUDENT) {
        // 학생: 게시글 접근 권한(수강 여부 등) 확인
        await this.validateInstructorPostReadAccessForStudent(post, profileId);
      } else if (userType === UserType.PARENT) {
        // 학부모: 자녀의 게시글 접근 권한 확인
        await this.validateInstructorPostReadAccessForParent(post, profileId);
      }
    } else {
      const post = await this.studentPostsRepository.findById(postId);
      if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

      // 강사/조교: 담당 강사에게 온 질문인지 확인
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        await this.permissionService.validateInstructorAccess(
          post.instructorId,
          userType,
          profileId,
        );
      } else if (userType === UserType.STUDENT) {
        // 학생: 본인의 질문인지 확인
        const enrollment = await this.enrollmentsRepository.findById(
          post.enrollmentId,
        );
        if (enrollment?.appStudentId !== profileId) {
          throw new ForbiddenException('본인의 질문에만 접근할 수 있습니다.');
        }
      } else if (userType === UserType.PARENT) {
        // 학부모: 자녀의 질문인지 확인
        const enrollment = await this.enrollmentsRepository.findById(
          post.enrollmentId,
        );
        if (
          !enrollment?.appParentLinkId ||
          !(await this.isChildOfParent(enrollment.appParentLinkId, profileId))
        ) {
          throw new ForbiddenException('자녀의 질문에만 접근할 수 있습니다.');
        }
      }
    }

    return comment;
  }

  /** 학생의 강사 공지 접근 권한 확인 (IDOR 방지) */
  private async validateInstructorPostReadAccessForStudent(
    post: NonNullable<
      Awaited<ReturnType<InstructorPostsRepository['findById']>>
    >,
    studentProfileId: string,
  ) {
    const { PostScope } = await import('../constants/posts.constant.js');

    if (post.scope === PostScope.GLOBAL) {
      await this.permissionService.validateInstructorStudentLink(
        post.instructorId,
        studentProfileId,
      );
    } else if (post.scope === PostScope.LECTURE && post.lectureId) {
      const isEnrolled =
        await this.lectureEnrollmentsRepository.existsByLectureIdAndStudentId(
          post.lectureId,
          studentProfileId,
        );
      if (!isEnrolled) throw new ForbiddenException('수강 중인 강의의 공지가 아닙니다.');
    } else if (post.scope === PostScope.SELECTED) {
      const isTargeted = post.targets.some(
        (t) => t.enrollment?.appStudentId === studentProfileId,
      );
      if (!isTargeted) throw new ForbiddenException('접근 권한이 없는 공지입니다.');
    }
  }

  /** 학부모의 강사 공지 접근 권한 확인 (IDOR 방지) */
  private async validateInstructorPostReadAccessForParent(
    post: NonNullable<
      Awaited<ReturnType<InstructorPostsRepository['findById']>>
    >,
    parentProfileId: string,
  ) {
    const { PostScope } = await import('../constants/posts.constant.js');
    const enrollmentIds =
      await this.permissionService.getParentEnrollmentIds(parentProfileId);

    if (post.scope === PostScope.GLOBAL) {
      const enrollments =
        await this.enrollmentsRepository.findByIds(enrollmentIds);
      const hasLink = enrollments.some(
        (e) => e.instructorId === post.instructorId,
      );
      if (!hasLink) throw new ForbiddenException('자녀가 해당 강사의 수강생이 아닙니다.');
    } else if (post.scope === PostScope.LECTURE && post.lectureId) {
      const hasAccess =
        await this.lectureEnrollmentsRepository.existsByLectureIdAndEnrollmentIds(
          post.lectureId,
          enrollmentIds,
        );
      if (!hasAccess) throw new ForbiddenException('자녀가 수강 중인 강의의 공지가 아닙니다.');
    } else if (post.scope === PostScope.SELECTED) {
      const isTargeted = post.targets.some((t) =>
        enrollmentIds.includes(t.enrollmentId),
      );
      if (!isTargeted) throw new ForbiddenException('자녀가 대상인 공지가 아닙니다.');
    }
  }

  /** 자녀 연결 여부 확인 헬퍼 */
  private async isChildOfParent(childLinkId: string, parentProfileId: string) {
    try {
      await this.permissionService.validateChildAccess(
        UserType.PARENT,
        parentProfileId,
        childLinkId,
      );
      return true;
    } catch {
      return false;
    }
  }

  /** 댓글 소유권 검증 */
  private async validateCommentOwnership(
    comment: Comment,
    userType: UserType,
    profileId: string,
  ) {
    let isOwner = false;

    switch (userType) {
      case UserType.STUDENT:
        if (comment.enrollmentId) {
          const enrollment = await this.enrollmentsRepository.findById(
            comment.enrollmentId,
          );
          isOwner = enrollment?.appStudentId === profileId;
        }
        break;
      case UserType.PARENT:
        if (comment.enrollmentId) {
          const enrollment = await this.enrollmentsRepository.findById(
            comment.enrollmentId,
          );
          if (enrollment && enrollment.appParentLinkId) {
            const parentChildLink =
              await this.parentChildLinkRepository.findById(
                enrollment.appParentLinkId,
              );
            isOwner =
              parentChildLink?.appParentId === profileId &&
              comment.authorRole === AuthorRole.PARENT;
          }
        }
        break;
      case UserType.INSTRUCTOR:
        isOwner = comment.instructorId === profileId;
        break;
      case UserType.ASSISTANT:
        isOwner = comment.assistantId === profileId;
        break;
      default:
        throw new ForbiddenException('권한이 없습니다.');
    }

    if (!isOwner) {
      throw new ForbiddenException('본인의 댓글만 수정/삭제할 수 있습니다.');
    }
  }

  /** 학생의 댓글 작성 가능 여부 확인 및 Enrollment ID 반환 */
  private async getStudentEnrollmentId(
    profileId: string,
    instructorPostId?: string,
    studentPostId?: string,
  ): Promise<string> {
    if (studentPostId) {
      const post = await this.studentPostsRepository.findById(studentPostId);
      if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

      if (!post.enrollmentId) {
        throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');
      }

      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException(
          '본인의 질문에만 댓글을 작성할 수 있습니다.',
        );
      }
      return post.enrollmentId;
    }

    if (instructorPostId) {
      const post =
        await this.instructorPostsRepository.findById(instructorPostId);
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      if (post.lectureId) {
        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            post.lectureId,
            profileId,
          );
        if (!enrollment) {
          throw new ForbiddenException(
            '해당 강의의 수강생만 댓글을 작성할 수 있습니다.',
          );
        }
        return enrollment.enrollmentId;
      }

      const lectureEnrollment =
        await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
          post.instructorId,
          profileId,
        );
      if (!lectureEnrollment) {
        throw new ForbiddenException(
          '해당 강사의 수강생만 댓글을 작성할 수 있습니다.',
        );
      }
      return lectureEnrollment.enrollmentId;
    }

    throw new BadRequestException('대상 게시글 ID가 필요합니다.');
  }

  /** 학부모의 댓글 작성 가능 여부 확인 및 Enrollment ID 반환 */
  private async getParentEnrollmentId(
    profileId: string,
    instructorPostId?: string,
    studentPostId?: string,
  ): Promise<string> {
    // 학부모의 자녀 링크 목록 조회
    const parentChildLinks =
      await this.parentChildLinkRepository.findByAppParentId(profileId);

    if (parentChildLinks.length === 0) {
      throw new ForbiddenException('자녀 정보를 찾을 수 없습니다.');
    }

    const appParentLinkIds = parentChildLinks.map((link) => link.id);

    if (studentPostId) {
      const post = await this.studentPostsRepository.findById(studentPostId);
      if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

      if (!post.enrollmentId) {
        throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');
      }

      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );

      if (
        !enrollment ||
        !appParentLinkIds.includes(enrollment.appParentLinkId ?? '')
      ) {
        throw new ForbiddenException(
          '본인 자녀의 질문에만 댓글을 작성할 수 있습니다.',
        );
      }
      return post.enrollmentId;
    }

    if (instructorPostId) {
      const post =
        await this.instructorPostsRepository.findById(instructorPostId);
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      // 강의 ID가 있는 경우: 해당 강의를 수강 중인 자녀 찾기
      if (post.lectureId) {
        const enrollments =
          await this.enrollmentsRepository.findManyByAppParentLinkIds(
            appParentLinkIds,
          );

        for (const enrollment of enrollments) {
          const lectureEnrollment =
            await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
              post.lectureId,
              enrollment.id,
            );
          if (lectureEnrollment) {
            return enrollment.id;
          }
        }
        throw new ForbiddenException(
          '해당 강의를 수강 중인 자녀만 댓글을 작성할 수 있습니다.',
        );
      }

      // 강의 ID가 없는 경우: 해당 강사의 수강생인 자녀 찾기
      const enrollments =
        await this.enrollmentsRepository.findManyByAppParentLinkIds(
          appParentLinkIds,
        );

      const matchedEnrollment = enrollments.find(
        (e) => e.instructorId === post.instructorId,
      );

      if (!matchedEnrollment) {
        throw new ForbiddenException(
          '해당 강사의 수강생인 자녀만 댓글을 작성할 수 있습니다.',
        );
      }
      return matchedEnrollment.id;
    }

    throw new BadRequestException('대상 게시글 ID가 필요합니다.');
  }

  /** 댓글에 isMine 필드 추가 (외부 서비스에서 사용) */
  addIsMineFieldToComment<T extends CommentMinimal>(
    comment: T,
    userType: UserType,
    profileId: string,
  ): T & { isMine: boolean } {
    return this.addIsMineField(comment, userType, profileId);
  }

  /** 댓글에 isMine 필드 추가 */
  private addIsMineField<T extends CommentMinimal>(
    comment: T,
    userType: UserType,
    profileId: string,
  ): T & { isMine: boolean } {
    let isMine = false;

    switch (userType) {
      case UserType.STUDENT:
        isMine =
          comment.enrollment?.appStudentId === profileId &&
          comment.authorRole === AuthorRole.STUDENT;
        break;
      case UserType.PARENT:
        isMine =
          comment.enrollment?.appParentLink?.appParentId === profileId &&
          comment.authorRole === AuthorRole.PARENT;
        break;
      case UserType.INSTRUCTOR:
        isMine = comment.instructorId === profileId;
        break;
      case UserType.ASSISTANT:
        isMine = comment.assistantId === profileId;
        break;
    }

    return {
      ...comment,
      isMine,
    };
  }

  /** 자료 소유권 검증 */
  private async validateMaterialOwnership(
    materialIds: string[],
    instructorId: string,
  ) {
    if (!materialIds || materialIds.length === 0) return;

    const materials = await this.materialsRepository.findByIds(materialIds);

    // 존재하지 않는 자료 확인
    if (materials.length !== materialIds.length) {
      const foundIds = materials.map((m) => m.id);
      const missingIds = materialIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(
        `자료를 찾을 수 없습니다: ${missingIds.join(', ')}`,
      );
    }

    // 소유권 확인 (모든 자료가 해당 강사의 라이브러리에 속해야 함)
    const unauthorizedMaterials = materials.filter(
      (m) => m.instructorId !== instructorId,
    );
    if (unauthorizedMaterials.length > 0) {
      throw new ForbiddenException('다른 강사의 자료는 첨부할 수 없습니다.');
    }
  }

  /** 댓글 생성 */
  async createComment(
    data: CreateCommentDto,
    userType: UserType,
    profileId: string,
  ) {
    if (data.instructorPostId && data.studentPostId) {
      throw new BadRequestException(
        'instructorPostId와 studentPostId를 동시에 지정할 수 없습니다.',
      );
    }

    const writerInfo = {
      instructorId: userType === UserType.INSTRUCTOR ? profileId : null,
      assistantId: userType === UserType.ASSISTANT ? profileId : null,
      enrollmentId: null as string | null,
      authorRole: userType,
      parentId: data.parentId,
    };

    // 대댓글인 경우 부모 댓글 존재 및 소속 게시글 확인
    if (data.parentId) {
      const parentComment = await this.commentsRepository.findById(data.parentId);
      if (!parentComment) throw new NotFoundException('부모 댓글을 찾을 수 없습니다.');

      const targetPostId = data.instructorPostId || data.studentPostId;
      const parentPostId = parentComment.instructorPostId || parentComment.studentPostId;

      if (targetPostId !== parentPostId) {
        throw new BadRequestException('부모 댓글이 해당 게시글에 속하지 않습니다.');
      }

      // 대댓글의 대댓글(3단계 이상) 제한 여부 기획에 따라 추가 가능 (현재는 2단계까지만 권장하는 경우가 많음)
      if (parentComment.parentId) {
        throw new BadRequestException('대댓글에는 댓글을 달 수 없습니다.');
      }
    }

    let studentPostForStatus: { id: string; status: string } | null = null;

    if (userType === UserType.STUDENT) {
      writerInfo.enrollmentId = await this.getStudentEnrollmentId(
        profileId,
        data.instructorPostId,
        data.studentPostId,
      );
    } else if (userType === UserType.PARENT) {
      writerInfo.enrollmentId = await this.getParentEnrollmentId(
        profileId,
        data.instructorPostId,
        data.studentPostId,
      );
    } else {
      // 강사/조교: 게시글 존재 여부 및 권한 확인
      const postId = data.instructorPostId || data.studentPostId;
      if (!postId)
        throw new BadRequestException('대상 게시글 ID가 필요합니다.');

      const repo = data.instructorPostId
        ? this.instructorPostsRepository
        : this.studentPostsRepository;
      const post = await repo.findById(postId);
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      // 권한 검증
      await this.permissionService.validateInstructorAccess(
        post.instructorId,
        userType,
        profileId,
      );

      // studentPost이고 PENDING 상태인 경우 나중에 트랜잭션에서 처리
      if (data.studentPostId && 'status' in post) {
        studentPostForStatus = { id: postId, status: post.status };
      }
    }

    if (data.materialIds?.length) {
      const instructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
      await this.validateMaterialOwnership(data.materialIds, instructorId);
    }

    // 강사/조교가 학생 질문에 댓글 작성 시 트랜잭션으로 처리
    if (
      studentPostForStatus &&
      studentPostForStatus.status === StudentPostStatus.PENDING
    ) {
      const comment =
        await this.commentsRepository.createCommentWithStudentPostStatusUpdate({
          content: data.content,
          studentPostId: studentPostForStatus.id,
          instructorId: writerInfo.instructorId,
          assistantId: writerInfo.assistantId,
          enrollmentId: writerInfo.enrollmentId,
          authorRole: writerInfo.authorRole,
          materialIds: data.materialIds,
        });
      return this.addIsMineField(comment, userType, profileId);
    }

    // 일반 댓글 생성
    const comment = await this.commentsRepository.create({
      ...data,
      ...writerInfo,
    });
    return this.addIsMineField(comment, userType, profileId);
  }

  /** 댓글 삭제 */
  async deleteComment(
    commentId: string,
    userType: UserType,
    profileId: string,
    postId?: string,
    postType?: 'instructorPost' | 'studentPost' | null,
  ) {
    if (!postId || !postType) {
      throw new BadRequestException('postId와 postType이 필요합니다.');
    }

    const comment = await this.validateAndGetComment(
      commentId,
      postId,
      postType,
      userType,
      profileId,
    );
    await this.validateCommentOwnership(comment, userType, profileId);

    return this.commentsRepository.delete(commentId);
  }

  /** 댓글 수정 */
  async updateComment(
    commentId: string,
    data: UpdateCommentDto,
    userType: UserType,
    profileId: string,
    postId?: string,
    postType?: 'instructorPost' | 'studentPost' | null,
  ) {
    if (!postId || !postType) {
      throw new BadRequestException('postId와 postType이 필요합니다.');
    }

    const comment = await this.validateAndGetComment(
      commentId,
      postId,
      postType,
      userType,
      profileId,
    );
    await this.validateCommentOwnership(comment, userType, profileId);

    if (data.materialIds?.length) {
      const instructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
      await this.validateMaterialOwnership(data.materialIds, instructorId);
    }

    const updatedComment = await this.commentsRepository.update(commentId, {
      content: data.content,
      materialIds: data.materialIds,
    });
    return this.addIsMineField(updatedComment, userType, profileId);
  }
}
