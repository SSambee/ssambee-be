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
  ) {
    // 1. 권한 검증 및 강사 ID 조회
    const instructorId = await this.permissionService.getEffectiveInstructorId(
      userType,
      profileId,
    );

    if (!instructorId) {
      throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
    }

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
      attachments: data.attachments || undefined,
      targetEnrollmentIds: data.targetEnrollmentIds || undefined,
    });

    return {
      ...post,
      attachments: this.normalizeAttachments(post.attachments),
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
    let studentFiltering:
      | {
          lectureIds: string[];
          instructorIds: string[];
          enrollmentIds: string[];
        }
      | undefined;

    // 2. 권한 설정 및 필터링 구축
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      instructorId = await this.permissionService.getEffectiveInstructorId(
        userType,
        profileId,
      );
    } else if (userType === UserType.STUDENT) {
      const enrollments =
        await this.lectureEnrollmentsRepository.findAllByAppStudentId(
          profileId,
        );

      studentFiltering = {
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

      studentFiltering = {
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

    const result = await this.instructorPostsRepository.findMany({
      lectureId: query.lectureId,
      scope: query.scope,
      search: query.search,
      page: query.page,
      limit: query.limit,
      instructorId,
      studentFiltering,
      postType: query.postType,
      orderBy: query.orderBy,
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
      posts: result.posts.map((post) => ({
        ...post,
        attachments: this.normalizeAttachments(post.attachments),
      })),
      totalCount: result.totalCount,
      stats,
    };
  }

  /** 공지 상세 조회 */
  async getPostDetail(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 조회 권한 검증
    await this.validatePostAccess(post, userType, profileId, 'READ');

    // 댓글에 isMine 및 첨부파일 정규화 적용
    const commentsWithIsMine = post.comments.map((comment) => {
      const commentWithIsMine = this.commentsService.addIsMineFieldToComment(
        comment,
        userType,
        profileId,
      );
      return {
        ...commentWithIsMine,
        attachments: this.normalizeAttachments(comment.attachments),
      };
    });

    if (userType === UserType.STUDENT) {
      // 학생용 첨부파일 필터링 (권한이 있는 자료만 노출)
      const accessibleAttachments = await this.filterAccessibleAttachments(
        post.attachments,
        profileId,
      );

      return {
        ...post,
        attachments: this.normalizeAttachments(accessibleAttachments),
        comments: commentsWithIsMine,
      };
    }

    return {
      ...post,
      attachments: this.normalizeAttachments(post.attachments),
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

  /**
   * 첨부파일 구조 정규화 (material.fileUrl을 root로 승격)
   */
  private normalizeAttachments<
    T extends {
      fileUrl: string | null;
      material?: { fileUrl: string | null } | null;
    },
  >(attachments: T[] | null | undefined) {
    if (!attachments) return [];
    return attachments.map((attr) => ({
      ...attr,
      fileUrl: attr.fileUrl || attr.material?.fileUrl || null,
    }));
  }

  /** 공지 수정 */
  async updatePost(
    postId: string,
    data: UpdateInstructorPostDto,
    userType: UserType,
    profileId: string,
  ) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 권한 검증
    await this.validatePostAccess(post, userType, profileId, 'UPDATE');

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

    if (isRedundant) {
      return post;
    }

    const updatedPost = await this.instructorPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      scope: data.scope,
      targetRole: data.targetRole,
      lectureId: data.lectureId,
      materialIds: data.materialIds || undefined,
      attachments: data.attachments || undefined,
      targetEnrollmentIds: data.targetEnrollmentIds || undefined,
    });

    if (!updatedPost) {
      throw new NotFoundException('게시글 수정 후 조회에 실패했습니다.');
    }

    return {
      ...updatedPost,
      attachments: this.normalizeAttachments(updatedPost.attachments),
    };
  }

  /** 공지 삭제 */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 권한 검증
    await this.validatePostAccess(post, userType, profileId, 'DELETE');

    return this.instructorPostsRepository.delete(postId);
  }

  // ----------------------------------------------------------------
  // Private Helper Methods
  // ----------------------------------------------------------------

  /** 게시글 접근 권한 검증 Helper */
  private async validatePostAccess(
    post: NonNullable<
      Awaited<ReturnType<InstructorPostsRepository['findById']>>
    >,
    userType: UserType,
    profileId: string,
    action: 'READ' | 'UPDATE' | 'DELETE',
  ) {
    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('본인의 게시글이 아닙니다.');
      }
      return;
    }

    if (userType === UserType.ASSISTANT) {
      if (action === 'READ') {
        const instructorId =
          await this.permissionService.getEffectiveInstructorId(
            userType,
            profileId,
          );
        if (post.instructorId !== instructorId) {
          throw new ForbiddenException('담당 강사의 게시글이 아닙니다.');
        }
      } else {
        // UPDATE/DELETE: 조교는 본인 글만 수정/삭제 가능
        if (post.authorAssistantId !== profileId) {
          throw new ForbiddenException(
            `본인이 작성한 글만 ${action === 'UPDATE' ? '수정' : '삭제'}할 수 있습니다.`,
          );
        }
      }
      return;
    }

    if (userType === UserType.STUDENT) {
      if (action !== 'READ') {
        throw new ForbiddenException('권한이 없습니다.');
      }

      // [SECURITY] 학부모 전용 게시글 접근 차단
      if (post.targetRole === TargetRole.PARENT) {
        throw new ForbiddenException('학부모 전용 게시글입니다.');
      }

      // Global: 해당 강사의 강의를 하나라도 수강 중인지 확인
      if (post.scope === PostScope.GLOBAL) {
        await this.permissionService.validateInstructorStudentLink(
          post.instructorId,
          profileId,
        );
      }

      // Lecture: 수강 여부 확인
      if (post.scope === PostScope.LECTURE && post.lectureId) {
        const lecture = await this.lecturesRepository.findById(post.lectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');
        await this.permissionService.validateLectureReadAccess(
          post.lectureId,
          lecture,
          userType,
          profileId,
        );
      }

      // Selected: 타겟 포함 여부 확인
      if (post.scope === PostScope.SELECTED) {
        const isTargeted = post.targets.some(
          (target) => target.enrollment?.appStudentId === profileId,
        );
        if (!isTargeted) {
          throw new ForbiddenException('접근 권한이 없습니다.');
        }
      }
      return;
    }

    if (userType === UserType.PARENT) {
      // [NEW] 학부모는 READ만 가능
      if (action !== 'READ') {
        throw new ForbiddenException('권한이 없습니다.');
      }

      // [SECURITY] 학생 전용 게시글 접근 차단
      if (post.targetRole === TargetRole.STUDENT) {
        throw new ForbiddenException('학생 전용 게시글입니다.');
      }

      // 자녀의 enrollment ID 목록 조회
      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);

      if (!enrollmentIds || enrollmentIds.length === 0) {
        throw new ForbiddenException('등록된 자녀가 없습니다.');
      }

      // Global: 자녀가 해당 강사의 강의를 하나라도 수강 중인지 확인
      if (post.scope === PostScope.GLOBAL) {
        const enrollments =
          await this.enrollmentsRepository.findByIds(enrollmentIds);
        const hasInstructorEnrollment = enrollments.some(
          (e) => e.instructorId === post.instructorId,
        );

        if (!hasInstructorEnrollment) {
          throw new ForbiddenException('자녀가 해당 강사의 수강생이 아닙니다.');
        }
      }

      // Lecture: 자녀가 해당 강의를 수강 중인지 확인
      if (post.scope === PostScope.LECTURE && post.lectureId) {
        await this.permissionService.validateParentLectureAccess(
          profileId,
          post.lectureId,
        );
      }

      // Selected: 자녀가 타겟에 포함되어 있는지 확인
      if (post.scope === PostScope.SELECTED) {
        const isTargeted = post.targets.some((target) =>
          enrollmentIds.includes(target.enrollmentId),
        );
        if (!isTargeted) {
          throw new ForbiddenException('접근 권한이 없습니다.');
        }
      }

      return;
    }

    throw new ForbiddenException('조회 권한이 없습니다.');
  }
}
