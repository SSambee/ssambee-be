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
    // 1. Enrollment 식별
    let enrollmentId = '';
    let authorRole = AuthorRole.STUDENT;

    // 질문은 'Enrollment(학생-강사 관계)'에 귀속됨
    // lectureId가 있으면 해당 강의의 enrollment를 찾음
    if (userType === UserType.STUDENT) {
      if (data.lectureId) {
        const lecture = await this.lecturesRepository.findById(data.lectureId);
        if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            data.lectureId,
            profileId,
          );
        if (!enrollment)
          throw new ForbiddenException('해당 강의를 수강하고 있지 않습니다.');

        enrollmentId = enrollment.enrollmentId;
      } else {
        throw new BadRequestException('강의 ID는 필수입니다.');
      }
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
      throw new ForbiddenException('조교 권한 검증이 구현되지 않았습니다.');
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
    if (userType === UserType.STUDENT) {
      // 본인 확인
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 질문만 조회할 수 있습니다.');
      }
    } else if (userType === UserType.INSTRUCTOR) {
      if (post.instructorId !== profileId) {
        throw new ForbiddenException('권한이 없습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      // 조교: 해당 게시글의 강사와 연결되어 있는지 확인
      const instructorId =
        await this.permissionService.getInstructorIdByAssistantId(profileId);
      if (!instructorId || instructorId !== post.instructorId) {
        throw new ForbiddenException('담당 강사의 질문만 조회할 수 있습니다.');
      }
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    // 학생용 댓글 첨부파일 필터링
    if (userType === UserType.STUDENT && post.comments) {
      const filteredComments = await Promise.all(
        post.comments.map(async (comment) => {
          // 학생이 해당 댓글의 첨부파일에 접근 가능한지 확인
          const accessibleAttachments = await this.filterAccessibleAttachments(
            comment.attachments,
            post.lectureId,
            post.instructorId,
            userType,
            profileId,
          );
          return {
            ...comment,
            attachments: accessibleAttachments,
          };
        }),
      );

      return {
        ...post,
        comments: filteredComments,
      };
    }

    return post;
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
    lectureId: string | null,
    instructorId: string,
    userType: UserType,
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
      // TODO: PermissionService 통합 후 getInstructorIdByAssistantId 사용
      throw new ForbiddenException('조교 권한 검증이 구현되지 않았습니다.');
    } else if (userType === UserType.STUDENT) {
      // 본인 글인지 확인
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId)
        throw new ForbiddenException('권한이 없습니다.');

      // 학생은 해결됨(RESOLVED)으로만 변경 가능
      if (status !== StudentPostStatus.PENDING) {
        throw new ForbiddenException(
          '학생은 해결됨 상태로만 변경할 수 있습니다.',
        );
      }
    } else {
      throw new ForbiddenException('상태 변경 권한이 없습니다.');
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
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 수정 권한이 없습니다.');
    }

    return this.commentsRepository.update(commentId, { content });
  }

  /** 질문 수정 (본인만 가능) */
  async updatePost(
    postId: string,
    data: { title?: string; content?: string },
    userType: UserType,
    profileId: string,
  ) {
    // 1. 게시글 존재 확인
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    // 2. 권한 검증 - 작성자 본인만 수정 가능
    if (userType === UserType.STUDENT) {
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 질문만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // TODO: 학부모 권한 검증 로직
      throw new ForbiddenException('학부모 권한 검증이 구현되지 않았습니다.');
    } else {
      throw new ForbiddenException('수정 권한이 없습니다.');
    }

    // 3. 변경사항 확인 (최소 하나의 필드 필요)
    if (!data.title && !data.content) {
      throw new BadRequestException('수정할 내용이 없습니다.');
    }

    // 4. 중복 업데이트 방지
    const isRedundant =
      (data.title === undefined || data.title === post.title) &&
      (data.content === undefined || data.content === post.content);

    if (isRedundant) {
      return post;
    }

    // 5. 업데이트 실행
    return this.studentPostsRepository.update(postId, {
      title: data.title,
      content: data.content,
    });
  }

  /** 질문 삭제 (본인만 가능) */
  async deletePost(postId: string, userType: UserType, profileId: string) {
    // 1. 게시글 존재 확인
    const post = await this.studentPostsRepository.findById(postId);
    if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

    // 2. 권한 검증 - 작성자 본인만 삭제 가능
    if (userType === UserType.STUDENT) {
      const enrollment = await this.enrollmentsRepository.findById(
        post.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 질문만 삭제할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // TODO: 학부모 권한 검증 로직
      throw new ForbiddenException('학부모 권한 검증이 구현되지 않았습니다.');
    } else {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }

    // 3. 삭제 실행 (cascade로 댓글도 함께 삭제됨)
    return this.studentPostsRepository.delete(postId);
  }
}
