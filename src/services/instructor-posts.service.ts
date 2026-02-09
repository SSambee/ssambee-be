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

    // 1. 권한 설정
    if (userType === UserType.INSTRUCTOR) {
      instructorId = profileId;
    } else if (userType === UserType.ASSISTANT) {
      const id =
        await this.permissionService.getInstructorIdByAssistantId(profileId);
      if (id) instructorId = id;
    } else if (userType === UserType.STUDENT) {
      // 학생은 강의별 조회 시 수강 권한 확인
      if (query.lectureId) {
        // LectureEnrollment 확인 필요 (PermissionService 또는 Repo 활용)
        // PermissionService에 강의 접근 권한 체크 로직 활용
        // 하지만 validateLectureReadAccess는 lecture 객체가 필요하므로
        // 여기서는 간단히 LectureEnrollmentsRepository를 통해 확인하거나
        // PermissionService의 validateStudentAccess 등을 활용해야 함.
        // 편의상 PermissionService에 메서드가 없다면 직접 구현하거나 추가해야 함.
        // 여기서는 PermissionService.validateLectureReadAccess를 호출하기 위해 lecture를 먼저 조회

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

    const result = await this.instructorPostsRepository.findMany({
      lectureId: query.lectureId,
      scope: query.scope,
      search: query.search,
      page: query.page,
      limit: query.limit,
      instructorId: userType === UserType.STUDENT ? undefined : instructorId,
    });

    // 학생인 경우 접근 권한이 있는 게시글만 필터링 (Global, Lecture, Selected 중 본인 타겟)
    if (userType === UserType.STUDENT) {
      const posts = result.posts as InstructorPostWithDetails[];
      const filteredPosts = posts.filter((post) => {
        // 유효한 스코프 확인
        if (!(Object.values(PostScope) as string[]).includes(post.scope))
          return false;

        // SELECTED인 경우 본인이 타겟 명단에 있는지 확인
        if (post.scope === PostScope.SELECTED) {
          return post.targets?.some(
            (t) => t.enrollment?.appStudentId === profileId,
          );
        }
        return true;
      });

      return {
        posts: filteredPosts,
        totalCount: filteredPosts.length, // 간소화를 위해 필터링된 개수로 응답
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
      // 1. Global: 해당 강사의 강의를 하나라도 수강 중인지 확인
      if (post.scope === PostScope.GLOBAL) {
        await this.permissionService.validateInstructorStudentLink(
          post.instructorId,
          profileId,
        );
        return post;
      }

      // 2. Lecture: 수강 여부 확인
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

      // 3. Selected: 타겟 포함 여부 확인
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
        // 조교는 본인 글만 수정 가능 (기획에 따라 강사 글 수정 허용할 수도 있음)
        throw new ForbiddenException('본인이 작성한 글만 수정할 수 있습니다.');
      }
    } else {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    // 첨부파일/타겟 변경 로직은 별도 처리 필요할 수 있음 (현재는 단순 필드 업데이트)
    // materialIds 변경 시 기존 관계 삭제 및 재생성 등의 로직이 Repository나 Service에 필요
    // 여기서는 기본 정보 업데이트만 수행

    return this.instructorPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
      isImportant: data.isImportant,
      scope: data.scope,
      targetRole: data.targetRole,
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
