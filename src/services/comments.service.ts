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
import {
  StudentPostStatus,
  AuthorRole,
  PostScope,
} from '../constants/posts.constant.js';
import { FileStorageService } from './filestorage.service.js';

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
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** 댓글 및 게시글 연관성 검증 */
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

    if (postIdField !== postId)
      throw new NotFoundException('해당 게시글에서 댓글을 찾을 수 없습니다.');

    // 게시글 접근 권한 검증 (강사/조교 IDOR 방지)
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      const repo =
        postType === 'instructorPost'
          ? this.instructorPostsRepository
          : this.studentPostsRepository;
      const post = await repo.findById(postId);

      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      await this.permissionService.validateInstructorAccess(
        post.instructorId,
        userType,
        profileId,
      );
    }

    return comment;
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

      if (!post.enrollmentId)
        throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');

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

      let enrollmentId = '';

      if (post.lectureId) {
        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            post.lectureId,
            profileId,
          );
        if (!enrollment)
          throw new ForbiddenException(
            '해당 강의의 수강생만 댓글을 작성할 수 있습니다.',
          );
        enrollmentId = enrollment.enrollmentId;
      } else {
        const lectureEnrollment =
          await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
            post.instructorId,
            profileId,
          );
        if (!lectureEnrollment)
          throw new ForbiddenException(
            '해당 강사의 수강생만 댓글을 작성할 수 있습니다.',
          );
        enrollmentId = lectureEnrollment.enrollmentId;
      }

      // [SECURITY] SELECTED 스코프인 경우 타겟 포함 여부 확인
      if (post.scope === PostScope.SELECTED) {
        const isTargeted = post.targets?.some(
          (t: { enrollmentId: string }) => t.enrollmentId === enrollmentId,
        );
        if (!isTargeted)
          throw new ForbiddenException('댓글 작성 권한이 없는 게시글입니다.');
      }

      return enrollmentId;
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

    if (parentChildLinks.length === 0)
      throw new ForbiddenException('자녀 정보를 찾을 수 없습니다.');

    const appParentLinkIds = parentChildLinks.map((link) => link.id);

    if (studentPostId) {
      const post = await this.studentPostsRepository.findById(studentPostId);
      if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

      if (!post.enrollmentId)
        throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');

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

      let matchedEnrollmentId = '';

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
            matchedEnrollmentId = enrollment.id;
            break;
          }
        }
        if (!matchedEnrollmentId) {
          throw new ForbiddenException(
            '해당 강의를 수강 중인 자녀만 댓글을 작성할 수 있습니다.',
          );
        }
      } else {
        // 강의 ID가 없는 경우: 해당 강사의 수강생인 자녀 찾기
        const enrollments =
          await this.enrollmentsRepository.findManyByAppParentLinkIds(
            appParentLinkIds,
          );

        const matchedEnrollment = enrollments.find(
          (e) => e.instructorId === post.instructorId,
        );

        if (!matchedEnrollment)
          throw new ForbiddenException(
            '해당 강사의 수강생인 자녀만 댓글을 작성할 수 있습니다.',
          );

        matchedEnrollmentId = matchedEnrollment.id;
      }

      // [SECURITY] SELECTED 스코프인 경우 자녀가 타겟에 포함되어 있는지 확인
      if (post.scope === PostScope.SELECTED) {
        const isTargeted = post.targets?.some(
          (t: { enrollmentId: string }) =>
            t.enrollmentId === matchedEnrollmentId,
        );
        if (!isTargeted)
          throw new ForbiddenException('댓글 작성 권한이 없는 게시글입니다.');
      }

      return matchedEnrollmentId;
    }

    throw new BadRequestException('대상 게시글 ID가 필요합니다.');
  }

  /** 댓글에 isMine 필드 추가 (외부 서비스에서 사용) */
  addIsMineFieldToComment<T extends Record<string, unknown>>(
    comment: T,
    userType: UserType,
    profileId: string,
  ): T & { isMine: boolean } {
    return this.addIsMineField(comment, userType, profileId);
  }

  /** 댓글에 isMine 필드 추가 */
  private addIsMineField<T extends Record<string, unknown>>(
    comment: T,
    userType: UserType,
    profileId: string,
  ): T & { isMine: boolean } {
    let isMine = false;

    const commentWithRelations = comment as T & {
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
    };

    switch (userType) {
      case UserType.STUDENT:
        isMine =
          commentWithRelations.enrollment?.appStudentId === profileId &&
          commentWithRelations.authorRole === AuthorRole.STUDENT;
        break;
      case UserType.PARENT:
        isMine =
          commentWithRelations.enrollment?.appParentLink?.appParentId ===
            profileId && commentWithRelations.authorRole === AuthorRole.PARENT;
        break;
      case UserType.INSTRUCTOR:
        isMine = commentWithRelations.instructorId === profileId;
        break;
      case UserType.ASSISTANT:
        isMine = commentWithRelations.assistantId === profileId;
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

    if (unauthorizedMaterials.length > 0)
      throw new ForbiddenException('다른 강사의 자료는 첨부할 수 없습니다.');
  }

  /** 댓글 생성 */
  async createComment(
    data: CreateCommentDto,
    userType: UserType,
    profileId: string,
    files?: Express.Multer.File[],
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
    };

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

    // 직접 첨부 파일 처리 (S3 업로드)
    const uploadedAttachments =
      await this.fileStorageService.uploadAttachments(files);

    // 기존 데이터의 attachments와 업로드된 attachments 결합
    const allAttachments = [
      ...(data.attachments || []),
      ...uploadedAttachments,
    ];

    // 강사/조교가 학생 질문에 댓글 작성 시 트랜잭션으로 처리
    if (
      studentPostForStatus &&
      studentPostForStatus.status === StudentPostStatus.BEFORE
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
          attachments: allAttachments.length ? allAttachments : undefined,
        });
      return {
        ...this.addIsMineField(comment, userType, profileId),
        attachments: await this.fileStorageService.resolvePresignedUrls(
          comment.attachments,
        ),
      };
    }

    // 일반 댓글 생성
    const result = await this.commentsRepository.create({
      ...data,
      ...writerInfo,
      attachments: allAttachments.length ? allAttachments : undefined,
    });
    return {
      ...this.addIsMineField(result, userType, profileId),
      attachments: await this.fileStorageService.resolvePresignedUrls(
        result.attachments,
      ),
    };
  }

  /** 댓글 삭제 */
  async deleteComment(
    commentId: string,
    userType: UserType,
    profileId: string,
    postId?: string,
    postType?: 'instructorPost' | 'studentPost' | null,
  ) {
    if (!postId || !postType)
      throw new BadRequestException('postId와 postType이 필요합니다.');

    const comment = await this.validateAndGetComment(
      commentId,
      postId,
      postType,
      userType,
      profileId,
    );
    await this.validateCommentOwnership(comment, userType, profileId);

    // 직접 업로드된 첨부 파일을 S3에서 삭제 (고아 파일 방지)
    const directAttachments =
      await this.commentsRepository.findDirectAttachmentsByCommentId(commentId);
    for (const attachment of directAttachments) {
      if (attachment.fileUrl) {
        await this.fileStorageService.delete(attachment.fileUrl);
      }
    }

    return this.commentsRepository.delete(commentId);
  }

  /** 특정 게시글의 모든 댓글에 포함된 직접 첨부 파일을 S3에서 삭제 (고아 파일 방지) */
  async deleteCommentAttachmentsByPostId(
    postId: string,
    postType: 'instructorPost' | 'studentPost',
  ) {
    const attachments =
      await this.commentsRepository.findDirectAttachmentsByPostId(
        postId,
        postType,
      );

    for (const attachment of attachments) {
      if (attachment.fileUrl) {
        await this.fileStorageService.delete(attachment.fileUrl);
      }
    }
  }

  /** 댓글 수정 */
  async updateComment(
    commentId: string,
    data: UpdateCommentDto,
    userType: UserType,
    profileId: string,
    postId?: string,
    postType?: 'instructorPost' | 'studentPost' | null,
    files?: Express.Multer.File[],
  ) {
    if (!postId || !postType)
      throw new BadRequestException('postId와 postType이 필요합니다.');

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

    // 새 파일이 업로드될 경우, 기존 직접 첨부 파일(직접 업로드된 파일) S3에서 삭제 (고아 파일 방지)
    if (files?.length) {
      const existingDirectAttachments =
        await this.commentsRepository.findDirectAttachmentsByCommentId(
          commentId,
        );
      for (const attachment of existingDirectAttachments) {
        if (attachment.fileUrl) {
          await this.fileStorageService.delete(attachment.fileUrl);
        }
      }
    }

    // 직접 첨부 파일 처리 (S3 업로드)
    const uploadedAttachments =
      await this.fileStorageService.uploadAttachments(files);

    // 기존 material 첨부(강사 자료)들은 유지하고, 새 직접 첨부가 있으면 교체
    const materialAttachments = data.attachments || [];
    const allAttachments = [...materialAttachments, ...uploadedAttachments];

    const updatedComment = await this.commentsRepository.update(commentId, {
      content: data.content,
      materialIds: data.materialIds,
      attachments: allAttachments.length ? allAttachments : undefined,
    });
    return {
      ...this.addIsMineField(updatedComment, userType, profileId),
      attachments: await this.fileStorageService.resolvePresignedUrls(
        updatedComment.attachments,
      ),
    };
  }

  /** 첨부파일 다운로드 URL 조회 */
  async getAttachmentDownloadUrl(
    attachmentId: string,
    userType: UserType,
    profileId: string,
  ): Promise<{ url: string }> {
    const attachment =
      await this.commentsRepository.findAttachmentById(attachmentId);

    if (!attachment)
      throw new NotFoundException('첨부파일을 찾을 수 없습니다.');

    const fileUrl = attachment.fileUrl || attachment.material?.fileUrl;
    if (!fileUrl) throw new NotFoundException('파일이 존재하지 않습니다.');

    const comment = attachment.comment;
    await this.validateAttachmentAccess(comment, userType, profileId);

    const downloadFileName = attachment.filename;
    const presignedUrl = await this.fileStorageService.getDownloadPresignedUrl(
      fileUrl,
      downloadFileName,
      3600, // 1시간 유효
    );

    return { url: presignedUrl };
  }

  /** 첨부파일 접근 권한 검증 */
  private async validateAttachmentAccess(
    comment: {
      id: string;
      instructorPostId: string | null;
      studentPostId: string | null;
      instructorId: string | null;
      assistantId: string | null;
      enrollmentId: string | null;
    },
    userType: UserType,
    profileId: string,
  ) {
    // 강사/조교인 경우
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      const postId = comment.instructorPostId || comment.studentPostId;

      if (!postId) throw new ForbiddenException('게시글 정보가 없습니다.');

      const repo = comment.instructorPostId
        ? this.instructorPostsRepository
        : this.studentPostsRepository;
      const post = await repo.findById(postId);

      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

      await this.permissionService.validateInstructorAccess(
        post.instructorId,
        userType,
        profileId,
      );
      return;
    }

    // 학생인 경우
    if (userType === UserType.STUDENT) {
      // 댓글이 학생 질문에 대한 것인지 확인
      if (comment.studentPostId) {
        const post = await this.studentPostsRepository.findById(
          comment.studentPostId,
        );

        if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

        if (!post.enrollmentId)
          throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');

        const enrollment = await this.enrollmentsRepository.findById(
          post.enrollmentId,
        );

        if (enrollment?.appStudentId !== profileId)
          throw new ForbiddenException('권한이 없습니다.');

        return;
      }
      // 강사 공지에 대한 댓글인 경우 - 수강 여부 확인
      if (comment.instructorPostId) {
        // 학생은 공지 댓글의 첨부파일에 접근할 수 있음 (공지를 볼 수 있다면)
        const post = await this.instructorPostsRepository.findById(
          comment.instructorPostId,
        );

        if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

        let enrollmentId: string;
        if (post.lectureId) {
          const le =
            await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
              post.lectureId,
              profileId,
            );

          if (!le)
            throw new ForbiddenException('해당 강의의 수강생이 아닙니다.');

          enrollmentId = le.enrollmentId;
        } else {
          const le =
            await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
              post.instructorId,
              profileId,
            );

          if (!le)
            throw new ForbiddenException('해당 강사의 수강생이 아닙니다.');

          enrollmentId = le.enrollmentId;
        }

        if (post.scope === PostScope.SELECTED) {
          const isTargeted = post.targets?.some(
            (t: { enrollmentId: string }) => t.enrollmentId === enrollmentId,
          );
          if (!isTargeted)
            throw new ForbiddenException('접근 권한이 없는 게시글입니다.');
        }
        return;
      }
    }

    // 학부모인 경우
    if (userType === UserType.PARENT) {
      if (comment.studentPostId) {
        const post = await this.studentPostsRepository.findById(
          comment.studentPostId,
        );

        if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

        if (!post.enrollmentId)
          throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');

        const enrollment = await this.enrollmentsRepository.findById(
          post.enrollmentId,
        );

        if (!enrollment?.appParentLinkId)
          throw new ForbiddenException('학부모 연결 정보가 없습니다.');

        await this.permissionService.validateChildAccess(
          userType,
          profileId,
          enrollment.appParentLinkId,
        );
        return;
      }

      if (comment.instructorPostId) {
        const post = await this.instructorPostsRepository.findById(
          comment.instructorPostId,
        );
        if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

        const parentChildLinks =
          await this.parentChildLinkRepository.findByAppParentId(profileId);
        const appParentLinkIds = parentChildLinks.map((link) => link.id);

        const enrollments =
          await this.enrollmentsRepository.findManyByAppParentLinkIds(
            appParentLinkIds,
          );

        let hasAccess = false;
        let matchedEnrollmentId: string | null = null;
        if (post.lectureId) {
          for (const enrollment of enrollments) {
            const le =
              await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
                post.lectureId,
                enrollment.id,
              );
            if (le) {
              hasAccess = true;
              matchedEnrollmentId = enrollment.id;
              break;
            }
          }
        } else {
          const matched = enrollments.find(
            (e) => e.instructorId === post.instructorId,
          );
          if (matched) {
            hasAccess = true;
            matchedEnrollmentId = matched.id;
          }
        }

        if (!hasAccess) throw new ForbiddenException('접근 권한이 없습니다.');

        // SELECTED 스코프인 경우 자녀가 타겟에 포함되어있는지
        if (post.scope === PostScope.SELECTED) {
          const isTargeted = post.targets?.some(
            (t: { enrollmentId: string }) =>
              t.enrollmentId === matchedEnrollmentId,
          );
          if (!isTargeted)
            throw new ForbiddenException('접근 권한이 없는 게시물입니다.');
        }
        return;
      }
    }

    throw new ForbiddenException('접근 권한이 없습니다.');
  }
}
