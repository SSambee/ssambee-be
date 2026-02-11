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
import { Comment } from '../generated/prisma/client.js';
import {
  CreateCommentDto,
  UpdateCommentDto,
} from '../validations/comments.validation.js';
import { StudentPostStatus } from '../constants/posts.constant.js';

export class CommentsService {
  constructor(
    private readonly commentsRepository: CommentsRepository,
    private readonly instructorPostsRepository: InstructorPostsRepository,
    private readonly studentPostsRepository: StudentPostsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly materialsRepository: MaterialsRepository,
    private readonly permissionService: PermissionService,
  ) {}

  /** 댓글 및 게시글 연관성 검증 */
  private async validateAndGetComment(
    commentId: string,
    postId: string,
    postType: 'instructorPost' | 'studentPost',
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
      case UserType.INSTRUCTOR:
        isOwner = comment.instructorId === profileId;
        break;
      case UserType.ASSISTANT:
        isOwner = comment.assistantId === profileId;
        break;
      case UserType.PARENT:
        throw new ForbiddenException(
          '학부모는 댓글을 수정/삭제할 수 없습니다.',
        );
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
    };

    let studentPostForStatus: { id: string; status: string } | null = null;

    if (userType === UserType.STUDENT) {
      writerInfo.enrollmentId = await this.getStudentEnrollmentId(
        profileId,
        data.instructorPostId,
        data.studentPostId,
      );
    } else if (userType === UserType.PARENT) {
      throw new ForbiddenException('학부모는 댓글을 작성할 수 없습니다.');
    } else {
      // 강사/조교: 게시글 존재 여부만 확인
      const postId = data.instructorPostId || data.studentPostId;
      if (!postId)
        throw new BadRequestException('대상 게시글 ID가 필요합니다.');

      const repo = data.instructorPostId
        ? this.instructorPostsRepository
        : this.studentPostsRepository;
      const post = await repo.findById(postId);
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

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
      return this.commentsRepository.createCommentWithStudentPostStatusUpdate({
        content: data.content,
        studentPostId: studentPostForStatus.id,
        instructorId: writerInfo.instructorId,
        assistantId: writerInfo.assistantId,
        enrollmentId: writerInfo.enrollmentId,
        materialIds: data.materialIds,
      });
    }

    // 일반 댓글 생성
    return this.commentsRepository.create({
      ...data,
      ...writerInfo,
    });
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

    return this.commentsRepository.update(commentId, {
      content: data.content,
      materialIds: data.materialIds,
    });
  }
}
