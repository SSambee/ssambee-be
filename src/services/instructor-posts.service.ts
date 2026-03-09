import { InstructorPost } from '../generated/prisma/client.js';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { PostScope, TargetRole } from '../constants/posts.constant.js';
import { UserType } from '../constants/auth.constant.js';
import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { PermissionService } from './permission.service.js';
import {
  CreateInstructorPostDto,
  UpdateInstructorPostDto,
  GetInstructorPostsQueryDto,
} from '../validations/instructor-posts.validation.js';

import { StudentPostsRepository } from '../repos/student-posts.repo.js';
import { formatStudentPostStats } from '../utils/posts.util.js';
import { CommentsService } from './comments.service.js';
import { FileStorageService } from './filestorage.service.js';

import { accessibleBy } from '@casl/prisma';
import { defineInstructorPostAbility } from '../casl/instructor-post.ability.js';
import type { InstructorPostAbilityContext } from '../casl/instructor-post.ability.js';
import { subject, ForbiddenError } from '@casl/ability';
import { Action as A } from '../casl/actions.js';
export class InstructorPostsService {
  constructor(
    private readonly instructorPostsRepository: InstructorPostsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly permissionService: PermissionService,
    private readonly studentPostsRepository: StudentPostsRepository, // [NEW]
    private readonly commentsService: CommentsService,
    private readonly fileStorageService: FileStorageService,
  ) {}

  /** 공지 타겟 학생 목록 조회 (강사의 모든 강의와 학생 목록) */
  async getPostTargets(userType: UserType, profileId: string) {
    // 0. 권한 검증 - 강사/조교만 접근 가능
    if (userType !== UserType.INSTRUCTOR && userType !== UserType.ASSISTANT) {
      throw new ForbiddenException('강사 또는 조교만 접근할 수 있습니다.');
    }

    // 1. 강사 ID 조회 (조교인 경우 담당 강사 ID)
    const instructorId = await this.permissionService.getEffectiveInstructorId(
      userType,
      profileId,
    );

    if (!instructorId) {
      throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
    }

    // 2. 해당 강사의 모든 강의 목록 조회
    const { lectures } = await this.lecturesRepository.findMany({
      page: 1,
      limit: 1000, // 모든 강의 조회
      instructorId,
    });

    // 3. 각 강의별 학생 목록 조회
    const lecturesWithStudents = await Promise.all(
      lectures.map(async (lecture) => {
        const lectureEnrollments =
          await this.lectureEnrollmentsRepository.findManyByLectureIdWithEnrollments(
            lecture.id,
          );

        return {
          lectureId: lecture.id,
          lectureTitle: lecture.title,
          lectureStatus: lecture.status,
          students: lectureEnrollments.map((le) => ({
            enrollmentId: le.enrollment.id,
            studentName: le.enrollment.studentName,
            studentPhone: le.enrollment.studentPhone,
            school: le.enrollment.school,
            schoolYear: le.enrollment.schoolYear,
          })),
          studentCount: lectureEnrollments.length,
        };
      }),
    );

    return {
      lectures: lecturesWithStudents,
      totalLectures: lecturesWithStudents.length,
      totalStudents: lecturesWithStudents.reduce(
        (sum, le) => sum + le.studentCount,
        0,
      ),
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

  /** 강사 공지 생성 */
  async createPost(
    data: CreateInstructorPostDto,
    profileId: string,
    userType: UserType,
    files?: Express.Multer.File[],
  ) {
    // 1. 권한 검증 및 강사 ID 조회
    const instructorId = await this.permissionService.getEffectiveInstructorId(
      userType,
      profileId,
    );

    if (!instructorId) {
      throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
    }

    const ability = await this.getAbility(userType, profileId);
    const newPostTemp = {
      instructorId,
      authorAssistantId: userType === UserType.ASSISTANT ? profileId : null,
    };

    // CASL Create 권한 검증
    ForbiddenError.from(ability).throwUnlessCan(
      A.Create,
      subject('InstructorPost', newPostTemp as unknown as InstructorPost),
    );

    // 2. 입력값 검증
    if (!data.title || data.title.trim() === '') {
      throw new BadRequestException('제목은 필수입니다.');
    }
    if (!data.content || data.content.trim() === '') {
      throw new BadRequestException('내용은 필수입니다.');
    }
    if (data.title.length > 100) {
      throw new BadRequestException('제목은 100자 이하여야 합니다.');
    }

    // 3. 강의별 공지인 경우 강의 존재 여부 및 권한 확인
    if (data.scope === PostScope.LECTURE) {
      if (!data.lectureId) {
        throw new BadRequestException('강의 공지는 lectureId가 필수입니다.');
      }
      const lecture = await this.lecturesRepository.findById(data.lectureId);
      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');
      if (lecture.instructorId !== instructorId) {
        throw new ForbiddenException('해당 강의에 대한 권한이 없습니다.');
      }
    }

    // 4. 타겟팅 유효성 검사
    if (
      data.scope === PostScope.SELECTED &&
      (!data.targetEnrollmentIds || data.targetEnrollmentIds.length === 0)
    ) {
      throw new BadRequestException('선택 공지는 대상 학생 지정이 필수입니다.');
    }

    // 4-1. 선택 공지의 경우 enrollment 존재 여부 확인
    if (data.scope === PostScope.SELECTED && data.targetEnrollmentIds) {
      const enrollments = await this.enrollmentsRepository.findByIds(
        data.targetEnrollmentIds,
      );
      if (enrollments.length !== data.targetEnrollmentIds.length) {
        const foundIds = enrollments.map((e) => e.id);
        const missingIds = data.targetEnrollmentIds.filter(
          (id) => !foundIds.includes(id),
        );
        throw new NotFoundException(
          `수강생을 찾을 수 없습니다: ${missingIds.join(', ')}`,
        );
      }
    }

    // 5. 자료 소유권 검증
    if (data.materialIds && data.materialIds.length > 0) {
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

    // 6. 생성
    const post = await this.instructorPostsRepository.create({
      title: data.title,
      content: data.content,
      scope: data.scope,
      targetRole: data.targetRole || TargetRole.ALL,
      isImportant: data.isImportant || false,
      lectureId: data.lectureId || null,
      instructorId,
      authorAssistantId: userType === UserType.ASSISTANT ? profileId : null,
      materialIds: data.materialIds || undefined,
      attachments: allAttachments.length ? allAttachments : undefined,
      targetEnrollmentIds: data.targetEnrollmentIds || undefined,
    });

    return {
      ...post,
      attachments: await this.fileStorageService.resolvePresignedUrls(
        post.attachments,
      ),
    };
  }

  /** 공지 목록 조회 */
  async getPostList(
    query: GetInstructorPostsQueryDto,
    userType: UserType,
    profileId: string,
  ) {
    // 페이지네이션 검증
    if (query.page <= 0) {
      throw new BadRequestException('page는 1 이상이어야 합니다.');
    }
    if (query.limit <= 0) {
      throw new BadRequestException('limit은 1 이상이어야 합니다.');
    }
    if (query.limit > 50) {
      throw new BadRequestException('limit은 50 이하여야 합니다.');
    }

    let instructorId: string | undefined;

    // 2. 권한 설정 및 필터링 구축
    const abilityCtx: InstructorPostAbilityContext = {
      userType,
      profileId,
    };

    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      instructorId = await this.permissionService.getEffectiveInstructorId(
        userType,
        profileId,
      );
      if (!instructorId) {
        throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
      }
      abilityCtx.effectiveInstructorId = instructorId;
    } else if (userType === UserType.STUDENT) {
      const enrollments =
        await this.lectureEnrollmentsRepository.findAllByAppStudentId(
          profileId,
        );

      abilityCtx.studentFields = {
        lectureIds: [...new Set(enrollments.map((e) => e.lectureId))],
        instructorIds: [
          ...new Set(enrollments.map((e) => e.lecture.instructorId)),
        ],
        enrollmentIds: [...new Set(enrollments.map((e) => e.enrollmentId))],
      };

      // 특정 강의 조회 시 수강 권한 확인
      if (query.lectureId) {
        const lecture = await this.lecturesRepository.findById(query.lectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');
        await this.permissionService.validateLectureReadAccess(
          query.lectureId,
          lecture,
          userType,
          profileId,
        );
      }
    } else if (userType === UserType.PARENT) {
      // [NEW] 학부모: 등록된 자녀 링크 확인
      const childLinks = await this.permissionService.getChildLinks(profileId);

      if (!childLinks || childLinks.length === 0) {
        throw new NotFoundException('등록된 자녀가 없습니다.');
      }

      // [NEW] 학부모: 모든 자녀의 수강 정보 조회
      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);

      if (!enrollmentIds || enrollmentIds.length === 0) {
        // 자녀는 있지만 수강 중인 강의가 없는 경우 빈 목록 반환
        return {
          posts: [],
          totalCount: 0,
          stats: null,
        };
      }

      // 모든 자녀의 LectureEnrollment 조회
      const lectureEnrollments =
        await this.lectureEnrollmentsRepository.findManyByEnrollmentIds(
          enrollmentIds,
        );

      abilityCtx.parentFields = {
        lectureIds: [...new Set(lectureEnrollments.map((e) => e.lectureId))],
        instructorIds: [
          ...new Set(lectureEnrollments.map((e) => e.lecture.instructorId)),
        ],
        enrollmentIds: enrollmentIds,
      };

      // 특정 강의 조회 시 권한 확인
      if (query.lectureId) {
        await this.permissionService.validateParentLectureAccess(
          profileId,
          query.lectureId,
        );
      }
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    const ability = defineInstructorPostAbility(abilityCtx);
    const abilityFilter = accessibleBy(ability).InstructorPost;

    const result = await this.instructorPostsRepository.findMany({
      lectureId: query.lectureId,
      scope: query.scope,
      search: query.search,
      page: query.page,
      limit: query.limit,
      postType: query.postType,
      orderBy: query.orderBy,
      abilityFilter,
    });

    // [Stats] 학생 질문 통계 추가 (강사/조교인 경우)
    // DRY: formatStudentPostStats 헬퍼 함수 사용 - student-posts.service.ts와 동일 로직 공유
    let stats = null;
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      // targetInstructorId는 위 로직에서 이미 구해짐 (강사는 본인, 조교는 소속 강사)
      if (instructorId) {
        const statsRaw =
          await this.studentPostsRepository.getStats(instructorId);
        stats = formatStudentPostStats(statsRaw);
      }
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

  /** 공지 상세 조회 */
  async getPostDetail(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 조회 권한 검증
    const ability = await this.getAbility(userType, profileId);
    ForbiddenError.from(ability).throwUnlessCan(
      A.Read,
      subject('InstructorPost', post as InstructorPost),
    );

    // 댓글에 isMine 및 첨부파일 정규화 적용
    const commentsWithIsMine = await Promise.all(
      post.comments.map(async (comment) => {
        const commentWithIsMine = this.commentsService.addIsMineFieldToComment(
          comment,
          userType,
          profileId,
        );
        return {
          ...commentWithIsMine,
          attachments: await this.fileStorageService.resolvePresignedUrls(
            comment.attachments,
          ),
        };
      }),
    );

    if (userType === UserType.STUDENT) {
      // 학생용 첨부파일 필터링 (권한이 있는 자료만 노출)
      const accessibleAttachments = await this.filterAccessibleAttachments(
        post.attachments,
        profileId,
      );

      return {
        ...post,
        attachments: await this.fileStorageService.resolvePresignedUrls(
          accessibleAttachments,
        ),
        comments: commentsWithIsMine,
      };
    }

    return {
      ...post,
      attachments: await this.fileStorageService.resolvePresignedUrls(
        post.attachments,
      ),
      comments: commentsWithIsMine,
    };
  }

  /** 학생용 첨부파일 접근 권한 필터링 */
  private async filterAccessibleAttachments(
    attachments: NonNullable<
      Awaited<ReturnType<InstructorPostsRepository['findById']>>
    >['attachments'],
    profileId: string,
  ) {
    if (!attachments || attachments.length === 0) return [];

    const result = [];

    for (const attachment of attachments) {
      // 직접 첨부(Direct)인 경우: materialId가 없으면 항상 노출
      if (!attachment.materialId) {
        result.push(attachment);
        continue;
      }

      const material = attachment.material;
      if (!material) continue;

      // 강의 자료인 경우: 해당 강의 수강 여부 확인
      if (material.lectureId) {
        const isEnrolled =
          await this.lectureEnrollmentsRepository.existsByLectureIdAndStudentId(
            material.lectureId,
            profileId,
          );
        if (!isEnrolled) continue;
      } else {
        // 라이브러리 자료인 경우: 해당 강사의 수강생인지 확인
        const enrollment =
          await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
            material.instructorId,
            profileId,
          );
        if (!enrollment) continue;
      }

      result.push(attachment);
    }

    return result;
  }

  /** 공지 수정 */
  async updatePost(
    postId: string,
    data: UpdateInstructorPostDto,
    userType: UserType,
    profileId: string,
    files?: Express.Multer.File[],
  ) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 권한 검증
    const ability = await this.getAbility(userType, profileId);
    ForbiddenError.from(ability).throwUnlessCan(
      A.Update,
      subject('InstructorPost', post as InstructorPost),
    );

    // 스코프 및 강의 유효성 검사
    const targetScope = data.scope || post.scope;
    const targetLectureId =
      data.lectureId !== undefined ? data.lectureId : post.lectureId;

    if (targetScope === PostScope.LECTURE) {
      if (!targetLectureId) {
        throw new BadRequestException('강의 공지는 lectureId가 필수입니다.');
      }

      // 강의 변경 또는 LECTURE 스코프 적용 시 권한 확인
      if (data.lectureId || data.scope === PostScope.LECTURE) {
        const lecture = await this.lecturesRepository.findById(targetLectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');
        const instructorId =
          await this.permissionService.getEffectiveInstructorId(
            userType,
            profileId,
          );
        if (lecture.instructorId !== instructorId) {
          throw new ForbiddenException('해당 강의에 대한 권한이 없습니다.');
        }
      }
    }

    if (
      targetScope === PostScope.SELECTED &&
      data.targetEnrollmentIds &&
      data.targetEnrollmentIds.length === 0
    ) {
      throw new BadRequestException('선택 공지는 대상 학생 지정이 필수입니다.');
    }

    // 자료 소유권 검증 (새로 첨부할 자료가 있는 경우)
    if (data.materialIds && data.materialIds.length > 0) {
      // 게시글의 소속 강사 ID를 기준으로 자료 소유권 확인 (일관성 유지)
      await this.validateMaterialOwnership(data.materialIds, post.instructorId);
    }

    // 변경 없음 확인 (중복 업데이트 방지)
    const currentMaterialIds = post.attachments
      .filter((a) => a.materialId !== null)
      .map((a) => a.materialId as string)
      .sort();
    const currentDirectAttachments = post.attachments
      .filter((a) => a.materialId === null)
      .map((a) => ({ filename: a.filename, fileUrl: a.fileUrl }))
      .sort((a, b) => a.filename.localeCompare(b.filename));

    const currentTargetEnrollmentIds = post.targets
      .map((t) => t.enrollmentId)
      .sort();

    const isRedundant =
      (data.title === undefined || data.title === post.title) &&
      (data.content === undefined || data.content === post.content) &&
      (data.isImportant === undefined ||
        data.isImportant === post.isImportant) &&
      (data.scope === undefined || data.scope === post.scope) &&
      (data.targetRole === undefined || data.targetRole === post.targetRole) &&
      (data.lectureId === undefined || data.lectureId === post.lectureId) &&
      (data.materialIds === undefined ||
        JSON.stringify([...(data.materialIds || [])].sort()) ===
          JSON.stringify(currentMaterialIds)) &&
      (data.attachments === undefined ||
        JSON.stringify(
          [...(data.attachments || [])].sort((a, b) =>
            a.filename.localeCompare(b.filename),
          ),
        ) === JSON.stringify(currentDirectAttachments)) &&
      (data.targetEnrollmentIds === undefined ||
        JSON.stringify([...(data.targetEnrollmentIds || [])].sort()) ===
          JSON.stringify(currentTargetEnrollmentIds));

    if (isRedundant && (!files || files.length === 0)) {
      return post;
    }

    // 직접 첨부 파일 처리 (S3 업로드)
    const uploadedAttachments =
      await this.fileStorageService.uploadAttachments(files);

    // 기존 데이터의 attachments와 업로드된 attachments 결합
    const allAttachments = [
      ...(data.attachments || []),
      ...uploadedAttachments,
    ];

    const updatedPost = await this.instructorPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      scope: data.scope,
      targetRole: data.targetRole,
      lectureId: data.lectureId,
      materialIds: data.materialIds || undefined,
      attachments: allAttachments.length ? allAttachments : undefined,
      targetEnrollmentIds: data.targetEnrollmentIds || undefined,
    });

    if (!updatedPost) {
      throw new NotFoundException('게시글 수정 후 조회에 실패했습니다.');
    }

    return {
      ...updatedPost,
      attachments: await this.fileStorageService.resolvePresignedUrls(
        updatedPost.attachments,
      ),
    };
  }

  /** 공지 삭제 */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 권한 검증
    const ability = await this.getAbility(userType, profileId);
    ForbiddenError.from(ability).throwUnlessCan(
      A.Delete,
      subject('InstructorPost', post),
    );

    // 댓글 첨부파일 삭제
    await this.commentsService.deleteCommentAttachmentsByPostId(
      postId,
      'instructorPost',
    );

    return this.instructorPostsRepository.delete(postId);
  }

  // ----------------------------------------------------------------
  // Private Helper Methods
  // ----------------------------------------------------------------

  /** CASL 기반 권한 Ability 인스턴스 반환 */
  private async getAbility(userType: UserType, profileId: string) {
    const abilityCtx: InstructorPostAbilityContext = { userType, profileId };

    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      const instructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
      if (!instructorId) {
        throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
      }
      abilityCtx.effectiveInstructorId = instructorId;
    } else if (userType === UserType.STUDENT) {
      const enrollments =
        await this.lectureEnrollmentsRepository.findAllByAppStudentId(
          profileId,
        );
      abilityCtx.studentFields = {
        lectureIds: [...new Set(enrollments.map((e) => e.lectureId))],
        instructorIds: [
          ...new Set(enrollments.map((e) => e.lecture.instructorId)),
        ],
        enrollmentIds: [...new Set(enrollments.map((e) => e.enrollmentId))],
      };
    } else if (userType === UserType.PARENT) {
      const childLinks = await this.permissionService.getChildLinks(profileId);
      if (!childLinks || childLinks.length === 0) {
        throw new NotFoundException('등록된 자녀가 없습니다.');
      }

      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);

      if (enrollmentIds && enrollmentIds.length > 0) {
        const lectureEnrollments =
          await this.lectureEnrollmentsRepository.findManyByEnrollmentIds(
            enrollmentIds,
          );
        abilityCtx.parentFields = {
          lectureIds: [...new Set(lectureEnrollments.map((e) => e.lectureId))],
          instructorIds: [
            ...new Set(lectureEnrollments.map((e) => e.lecture.instructorId)),
          ],
          enrollmentIds: enrollmentIds,
        };
      }
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    return defineInstructorPostAbility(abilityCtx);
  }
}
