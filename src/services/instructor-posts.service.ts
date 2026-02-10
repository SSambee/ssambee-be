import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { PostScope, TargetRole } from '../constants/posts.constant.js';
import { UserType } from '../constants/auth.constant.js';
import {
  InstructorPostsRepository,
  InstructorPostWithDetails,
} from '../repos/instructor-posts.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { PermissionService } from './permission.service.js';
import {
  CreateInstructorPostDto,
  UpdateInstructorPostDto,
  GetInstructorPostsQueryDto,
} from '../validations/instructor-posts.validation.js';

export class InstructorPostsService {
  constructor(
    private readonly instructorPostsRepository: InstructorPostsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly permissionService: PermissionService,
  ) {}

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
    // 1. 권한 검증 (강사/조교만 가능)
    const instructorId =
      userType === UserType.INSTRUCTOR
        ? profileId
        : await this.permissionService.getInstructorIdByAssistantId(profileId);

    if (!instructorId) {
      throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
    }

    // 2. 강의별 공지인 경우 강의 존재 여부 및 권한 확인
    if (data.scope === PostScope.LECTURE && data.lectureId) {
      const lecture = await this.lecturesRepository.findById(data.lectureId);
      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');
      if (lecture.instructorId !== instructorId) {
        throw new ForbiddenException('해당 강의에 대한 권한이 없습니다.');
      }
    } else if (data.scope === PostScope.LECTURE && !data.lectureId) {
      throw new BadRequestException('강의 공지는 lectureId가 필수입니다.');
    }

    // 3. 타겟팅 유효성 검사 (SELECTED인데 타겟 없으면 에러 등)
    if (
      data.scope === PostScope.SELECTED &&
      (!data.targetEnrollmentIds || data.targetEnrollmentIds.length === 0)
    ) {
      throw new BadRequestException('선택 공지는 대상 학생 지정이 필수입니다.');
    }

    // 4. 자료 소유권 검증
    if (data.materialIds && data.materialIds.length > 0) {
      await this.validateMaterialOwnership(data.materialIds, instructorId);
    }

    // 5. 생성
    return this.instructorPostsRepository.create({
      title: data.title,
      content: data.content,
      scope: data.scope,
      targetRole: data.targetRole || TargetRole.ALL,
      isImportant: data.isImportant || false,
      lectureId: data.lectureId || null,
      instructorId,
      authorAssistantId: userType === UserType.ASSISTANT ? profileId : null,
      materialIds: data.materialIds,
      targetEnrollmentIds: data.targetEnrollmentIds,
    });
  }

  /** 공지 목록 조회 */
  async getPostList(
    query: GetInstructorPostsQueryDto,
    userType: UserType,
    profileId: string,
  ) {
    let instructorId: string | undefined;
    let _appStudentId: string | undefined; // 향후 SELECTED 스코프 DB 필터링 시 사용 가능 (미구현)
    let targetEnrollmentIds: string[] | undefined;

    // 1. 권한 설정
    if (userType === UserType.INSTRUCTOR) {
      instructorId = profileId;
    } else if (userType === UserType.ASSISTANT) {
      const id =
        await this.permissionService.getInstructorIdByAssistantId(profileId);
      if (id) instructorId = id;
    } else if (userType === UserType.STUDENT) {
      _appStudentId = profileId;

      // 학생은 조회 시 본인 enrollment ID 목록이 필요 (SELECTED 스코프 필터링)
      // TODO: 향후 EnrollmentsRepository를 통해 조회하여 targetEnrollmentIds 할당

      // 학생은 강의별 조회 시 수강 권한 확인
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
    }

    // 2. SELECTED 스코프 필터링 (학생용)
    // 학생의 경우 현재 in-memory 필터링으로 처리 (향후 DB 레벨 구현 가능)

    const result = await this.instructorPostsRepository.findMany({
      lectureId: query.lectureId,
      scope: query.scope,
      search: query.search,
      page: query.page,
      limit: query.limit,
      instructorId: userType === UserType.STUDENT ? undefined : instructorId,
      targetEnrollmentIds, // 학생용 SELECTED 스코프 필터링 (미구현 시 undefined)
    });

    // 학생용 게시글 필터링 (본인 권한에 맞는 게시글만 반환)
    if (userType === UserType.STUDENT) {
      const posts = result.posts as InstructorPostWithDetails[];

      // 현재 페이지 결과에 대해 in-memory 필터링
      // TODO: DB 레벨 targetEnrollmentIds 필터링 구현 시 페이지네이션 정확성 확보
      const filteredPosts = posts.filter((post) => {
        // 유효하지 않은 스코프는 필터링
        if (!(Object.values(PostScope) as string[]).includes(post.scope)) {
          return false;
        }

        // SELECTED 스코프: 본인이 타겟인지 확인
        if (post.scope === PostScope.SELECTED) {
          return post.targets?.some(
            (t) => t.enrollment?.appStudentId === profileId,
          );
        }
        return true;
      });

      // 페이지네이션 정확성을 위해 전체 개수는 별도 조회 필요
      // 현재는 간소화하여 필터링된 개수로 응답
      return {
        posts: filteredPosts,
        totalCount: filteredPosts.length,
      };
    }

    return result;
  }

  /** 공지 상세 조회 */
  async getPostDetail(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 조회 권한 검증
    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('본인의 게시글이 아닙니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      const instructorId =
        await this.permissionService.getInstructorIdByAssistantId(profileId);
      if (post.instructorId !== instructorId) {
        throw new ForbiddenException('담당 강사의 게시글이 아닙니다.');
      }
    } else if (userType === UserType.STUDENT) {
      // Global: 해당 강사의 강의를 하나라도 수강 중인지 확인
      if (post.scope === PostScope.GLOBAL) {
        await this.permissionService.validateInstructorStudentLink(
          post.instructorId,
          profileId,
        );
        return post;
      }

      // Lecture: 수강 여부 확인
      if (post.scope === PostScope.LECTURE && post.lectureId) {
        const lecture = await this.lecturesRepository.findById(post.lectureId);
        if (lecture) {
          await this.permissionService.validateLectureReadAccess(
            post.lectureId,
            lecture,
            userType,
            profileId,
          );
        }
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
    }

    return post;
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

    // 권한 검증 (작성자 또는 해당 강사)
    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('수정 권한이 없습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      if (post.authorAssistantId !== profileId) {
        throw new ForbiddenException('본인이 작성한 글만 수정할 수 있습니다.');
      }
    } else {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

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
          userType === UserType.INSTRUCTOR
            ? profileId
            : await this.permissionService.getInstructorIdByAssistantId(
                profileId,
              );
        if (lecture.instructorId !== instructorId) {
          throw new ForbiddenException('해당 강의에 대한 권한이 없습니다.');
        }
      }
    }

    if (
      targetScope === PostScope.SELECTED &&
      data.targetEnrollmentIds !== undefined &&
      data.targetEnrollmentIds.length === 0
    ) {
      throw new BadRequestException('선택 공지는 대상 학생 지정이 필수입니다.');
    }

    // 3. 자료 소유권 검증 (새로 첨부할 자료가 있는 경우)
    if (data.materialIds && data.materialIds.length > 0) {
      const instructorId =
        userType === UserType.INSTRUCTOR
          ? profileId
          : await this.permissionService.getInstructorIdByAssistantId(
              profileId,
            );
      if (instructorId) {
        await this.validateMaterialOwnership(data.materialIds, instructorId);
      }
    }

    // 변경 없음 확인 (중복 업데이트 방지)
    const currentMaterialIds = post.attachments
      .map((a) => a.materialId)
      .filter((id): id is string => !!id)
      .sort();
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
        JSON.stringify([...data.materialIds].sort()) ===
          JSON.stringify(currentMaterialIds)) &&
      (data.targetEnrollmentIds === undefined ||
        JSON.stringify([...data.targetEnrollmentIds].sort()) ===
          JSON.stringify(currentTargetEnrollmentIds));

    if (isRedundant) {
      return post;
    }

    return this.instructorPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      scope: data.scope,
      targetRole: data.targetRole,
      lectureId: data.lectureId,
      materialIds: data.materialIds,
      targetEnrollmentIds: data.targetEnrollmentIds,
    });
  }

  /** 공지 삭제 */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    const post = await this.instructorPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    // 권한 검증
    if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('삭제 권한이 없습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      if (post.authorAssistantId !== profileId) {
        throw new ForbiddenException('본인이 작성한 글만 삭제할 수 있습니다.');
      }
    } else {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    return this.instructorPostsRepository.delete(postId);
  }
}
