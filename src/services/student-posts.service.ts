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
import { StudentPost, Material } from '../generated/prisma/client.js';
import { formatStudentPostStats } from '../utils/posts.util.js';
import { CommentsService } from './comments.service.js';
import { FileStorageService } from './filestorage.service.js';

import { subject } from '@casl/ability';
import { accessibleBy } from '@casl/prisma';
import { defineStudentPostAbility } from '../casl/student-post.ability.js';
import type { AbilityContext } from '../casl/student-post.ability.js';
import { Action as A } from '../casl/actions.js';
import type { AppAbility } from '../casl/ability.types.js';

export class StudentPostsService {
  constructor(
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly commentsRepository: CommentsRepository,
    private readonly permissionService: PermissionService,
    private readonly commentsService: CommentsService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** 질문 생성 (학생/학부모) */
  async createPost(
    data: CreateStudentPostDto & { childLinkId?: string }, // [NEW] 학부모용
    userType: UserType,
    profileId: string,
    files?: Express.Multer.File[],
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
      // 학부모 질문 작성
      if (!data.childLinkId)
        throw new BadRequestException('자녀 선택이 필요합니다.');

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

    // CASL 생성 권한 검증 (조건: 본인 enrollment 소속 + 올바른 authorRole)
    const abilityForCreate = await this.buildAbility(userType, profileId);
    this.assertPostAccess(
      abilityForCreate,
      A.Create,
      {
        enrollmentId,
        authorRole,
        instructorId: enrollment.instructorId,
      },
      '질문 작성 권한이 없습니다.',
    );

    // 직접 첨부 파일 처리 (S3 업로드)
    const uploadedAttachments =
      await this.fileStorageService.uploadAttachments(files);

    // 기존 데이터의 attachments와 업로드된 attachments 결합
    const allAttachments = [
      ...(data.attachments || []),
      ...uploadedAttachments,
    ];

    const result = await this.studentPostsRepository.create({
      title: data.title,
      content: data.content,
      status: StudentPostStatus.BEFORE,
      enrollmentId,
      authorRole,
      instructorId: enrollment.instructorId,
      lectureId: data.lectureId || null,
      attachments: allAttachments.length ? allAttachments : undefined,
    });

    return {
      ...result,
      attachments: await this.fileStorageService.resolvePresignedUrls(
        result.attachments,
      ),
    };
  }

  /** 질문 목록 조회 */
  async getPostList(
    query: GetStudentPostsQueryDto,
    userType: UserType,
    profileId: string,
  ) {
    if (userType === UserType.PARENT) {
      const childLinks = await this.permissionService.getChildLinks(profileId);
      if (!childLinks || childLinks.length === 0) {
        throw new NotFoundException('등록된 자녀가 없습니다.');
      }
      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);
      if (!enrollmentIds || enrollmentIds.length === 0) {
        return { posts: [], totalCount: 0, stats: null };
      }
    }

    const ability = await this.buildAbility(userType, profileId);
    if (!ability.can(A.List, 'StudentPost')) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    const accessFilter = accessibleBy(ability, A.List).StudentPost;

    const result = await this.studentPostsRepository.findMany({
      ...query,
      status: query.answerStatus, // answerStatus → status 매핑
      accessFilter,
    });

    // [Stats] 학생 질문 통계 추가 (강사/조교인 경우)
    let stats = null;
    let effectiveInstructorId: string | undefined;

    if (userType === UserType.INSTRUCTOR) {
      effectiveInstructorId = profileId;
    } else if (userType === UserType.ASSISTANT) {
      effectiveInstructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
    }

    if (effectiveInstructorId) {
      const statsRaw = await this.studentPostsRepository.getStats(
        effectiveInstructorId,
      );
      stats = formatStudentPostStats(statsRaw);
    }

    return {
      posts: await Promise.all(
        result.posts.map(async (post) => ({
          ...post,
          attachments: await this.fileStorageService.resolvePresignedUrls(
            post.attachments,
          ),
        })),
      ),
      totalCount: result.totalCount,
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
          lectureTimes: le.lecture.lectureTimes,
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
    const ability = await this.buildAbility(userType, profileId);
    this.assertPostAccess(ability, A.Read, post);

    // 댓글에 isMine 및 첨부파일 필터링/정규화 적용
    const processedComments = post.comments
      ? await this.processPostComments(post, userType, profileId)
      : [];

    return {
      ...post,
      attachments: await this.fileStorageService.resolvePresignedUrls(
        post.attachments,
      ),
      comments: processedComments,
    };
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

    // 권한 검증 (강사/조교는 UpdateStatus 권한 없음 — CASL 정의에서 자동 거부)
    const ability = await this.buildAbility(userType, profileId);
    this.assertPostAccess(
      ability,
      A.UpdateStatus,
      post,
      '질문의 상태를 변경할 권한이 없습니다.',
    );

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

  /** 질문 수정 (본인만 가능) */
  async updatePost(
    postId: string,
    data: {
      title?: string;
      content?: string;
      attachments?: { filename: string; fileUrl: string }[];
    },
    userType: UserType,
    profileId: string,
    files?: Express.Multer.File[],
  ) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    const ability = await this.buildAbility(userType, profileId);
    this.assertPostAccess(
      ability,
      A.Update,
      post,
      '본인이 작성한 질문만 수정할 수 있습니다.',
    );

    if (!data.title && !data.content && data.attachments === undefined) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }

    const isRedundant =
      (data.title === undefined || data.title === post.title) &&
      (data.content === undefined || data.content === post.content) &&
      (data.attachments === undefined ||
        JSON.stringify(
          [...(data.attachments || [])].sort(
            (a, b) =>
              a.filename.localeCompare(b.filename) ||
              a.fileUrl.localeCompare(b.fileUrl),
          ),
        ) ===
          JSON.stringify(
            post.attachments
              ?.map((a) => ({
                filename: a.filename,
                fileUrl: a.fileUrl,
              }))
              .sort(
                (a, b) =>
                  a.filename.localeCompare(b.filename) ||
                  (a.fileUrl ?? '').localeCompare(b.fileUrl ?? ''),
              ),
          ));

    if (isRedundant && (!files || files.length === 0)) {
      return post;
    }

    // 직접 첨부 파일 처리 (S3 업로드)
    const uploadedAttachments =
      await this.fileStorageService.uploadAttachments(files);

    if (uploadedAttachments.length > 0) {
      // 새 파일 업로드 성공 후 기존 첨부 파일 삭제 (고아 파일 방지)
      const oldAttachments = post.attachments ?? [];
      await Promise.all(
        oldAttachments
          .filter((a) => a.fileUrl)
          .map((a) => this.fileStorageService.delete(a.fileUrl!)),
      );
    }

    // 기존 데이터의 attachments와 업로드된 attachments 결합
    const allAttachments = [
      ...(data.attachments || []),
      ...uploadedAttachments,
    ];

    return this.studentPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
      attachments: allAttachments.length ? allAttachments : undefined,
    });
  }

  /** 질문 삭제 (본인만 가능) */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    const ability = await this.buildAbility(userType, profileId);
    this.assertPostAccess(
      ability,
      A.Delete,
      post,
      '본인이 작성한 질문만 삭제할 수 있습니다.',
    );

    // S3 첨부파일 삭제
    if (post.attachments?.length) {
      for (const attachment of post.attachments) {
        if (attachment.fileUrl) {
          await this.fileStorageService.delete(attachment.fileUrl);
        }
      }
    }

    // 댓글 첨부파일 삭제
    await this.commentsService.deleteCommentAttachmentsByPostId(
      postId,
      'studentPost',
    );

    return this.studentPostsRepository.delete(postId);
  }

  // ----------------------------------------------------------------
  // Private Helper Methods
  // ----------------------------------------------------------------

  private assertPostAccess(
    ability: AppAbility,
    action: A,
    post: Partial<StudentPost>,
    message: string = '권한이 없습니다.',
  ) {
    if (!ability.can(action, subject('StudentPost', post as StudentPost))) {
      throw new ForbiddenException(message);
    }
  }

  private async buildAbility(
    userType: UserType,
    profileId: string,
  ): Promise<AppAbility> {
    const ctx: AbilityContext = { userType, profileId };

    switch (userType) {
      case UserType.STUDENT: {
        const enrollments =
          await this.enrollmentsRepository.findManyByAppStudentId(profileId);
        ctx.enrollmentIds = enrollments.map((e) => e.id);
        break;
      }
      case UserType.INSTRUCTOR: {
        ctx.effectiveInstructorId = profileId;
        break;
      }
      case UserType.ASSISTANT: {
        ctx.effectiveInstructorId =
          await this.permissionService.getEffectiveInstructorId(
            userType,
            profileId,
          );
        break;
      }
      case UserType.PARENT: {
        ctx.parentEnrollmentIds =
          await this.permissionService.getParentEnrollmentIds(profileId);
        break;
      }
    }

    return defineStudentPostAbility(ctx);
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

    if (!enrollment)
      throw new ForbiddenException('해당 강의를 수강하고 있지 않습니다.');

    return enrollment.enrollmentId;
  }

  /** 학부모 질문 작성을 위한 Enrollment ID 조회 Helper */
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
        let finalAttachments = comment.attachments;
        if (userType === UserType.STUDENT) {
          finalAttachments = await this.filterAccessibleAttachments(
            comment.attachments,
            profileId,
          );
        }

        return {
          ...commentWithIsMine,
          attachments:
            await this.fileStorageService.resolvePresignedUrls(
              finalAttachments,
            ),
        };
      }),
    );
  }

  /** 학생용 첨부파일 접근 권한 필터링 */
  private async filterAccessibleAttachments<
    T extends {
      materialId: string | null;
      material: Material | null;
    },
  >(attachments: T[], profileId: string): Promise<T[]> {
    if (!attachments || attachments.length === 0) return [];

    const result: T[] = [];

    for (const attachment of attachments) {
      // 직접 첨부(Direct)인 경우: materialId가 없으면 항상 노출
      if (!attachment.materialId) {
        result.push(attachment);
        continue;
      }

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

  /** 첨부파일 다운로드 URL 조회 */
  async getAttachmentDownloadUrl(
    attachmentId: string,
    userType: UserType,
    profileId: string,
  ): Promise<{ url: string }> {
    const attachment =
      await this.studentPostsRepository.findAttachmentById(attachmentId);

    if (!attachment)
      throw new NotFoundException('첨부파일을 찾을 수 없습니다.');

    const fileUrl = attachment.fileUrl;
    if (!fileUrl) throw new NotFoundException('파일이 존재하지 않습니다.');

    const post = attachment.studentPost;
    const ability = await this.buildAbility(userType, profileId);
    this.assertPostAccess(ability, A.Read, post);

    const downloadFileName = attachment.filename;
    const presignedUrl = await this.fileStorageService.getDownloadPresignedUrl(
      fileUrl,
      downloadFileName,
      3600, // 1시간 유효
    );

    return { url: presignedUrl };
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
