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
import {
  CreateCommentDto,
  UpdateCommentDto,
} from '../validations/comments.validation.js';

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
    // 상호 배타성 검증 (방어코드)
    if (data.instructorPostId && data.studentPostId) {
      throw new BadRequestException(
        'instructorPostId와 studentPostId를 동시에 지정할 수 없습니다.',
      );
    }

    // 게시글 존재 여부 확인
    if (data.instructorPostId) {
      const post = await this.instructorPostsRepository.findById(
        data.instructorPostId,
      );
      if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
      // 읽기 권한 확인 필요 (여기서는 생략)
    } else if (data.studentPostId) {
      const post = await this.studentPostsRepository.findById(
        data.studentPostId,
      );
      if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');
      // 읽기 권한 확인 필요
    } else {
      throw new NotFoundException('대상 게시글 ID가 필요합니다.');
    }

    // 작성자 정보 설정
    const writerInfo = {
      instructorId: userType === UserType.INSTRUCTOR ? profileId : null,
      assistantId: userType === UserType.ASSISTANT ? profileId : null,
      enrollmentId: null as string | null,
    };

    if (userType === UserType.PARENT) {
      throw new ForbiddenException('학부모는 댓글을 작성할 수 없습니다.');
    }

    if (userType === UserType.STUDENT) {
      // 학생: 게시글이 속한 Enrollment를 찾아서 연결
      if (data.studentPostId) {
        // 학생 질문에 대한 댓글인 경우
        const post = await this.studentPostsRepository.findById(
          data.studentPostId,
        );
        if (!post) throw new NotFoundException('질문을 찾을 수 없습니다.');

        if (post.enrollmentId) {
          const enrollment = await this.enrollmentsRepository.findById(
            post.enrollmentId,
          );
          if (enrollment?.appStudentId === profileId) {
            // 본인의 Enrollment인 경우에만 연결
            writerInfo.enrollmentId = post.enrollmentId;
          } else {
            // 다른 학생의 질문에는 댓글 불가
            throw new ForbiddenException(
              '본인의 질문에만 댓글을 작성할 수 있습니다.',
            );
          }
        } else {
          throw new ForbiddenException('질문 정보를 찾을 수 없습니다.');
        }
      } else if (data.instructorPostId) {
        // 강사 게시글 댓글 작성
        const post = await this.instructorPostsRepository.findById(
          data.instructorPostId,
        );
        if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

        let enrollmentId = null;

        if (post.lectureId) {
          // 강의 지정 게시글인 경우: 해당 강의 수강생인지 확인
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
          enrollmentId = enrollment.enrollmentId; // LectureEnrollment가 아닌 Enrollment ID 사용
        } else {
          // 전체 공지(GLOBAL)인 경우: 해당 강사의 수강생인지 확인 (아무 강의나 하나라도 수강 중이면 OK)
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
          enrollmentId = lectureEnrollment.enrollmentId; // LectureEnrollment가 아닌 Enrollment ID 사용
        }

        writerInfo.enrollmentId = enrollmentId;
      }
    }

    // 자료 소유권 검증
    if (data.materialIds && data.materialIds.length > 0) {
      const instructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
      await this.validateMaterialOwnership(data.materialIds, instructorId);
    }

    return this.commentsRepository.create({
      content: data.content,
      instructorPostId: data.instructorPostId,
      studentPostId: data.studentPostId,
      instructorId: writerInfo.instructorId,
      assistantId: writerInfo.assistantId,
      enrollmentId: writerInfo.enrollmentId,
      materialIds: data.materialIds,
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
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    // 댓글이 해당 게시글에 속하는지 검증 (REST semantics 준수)
    if (postId && postType) {
      const postIdField =
        postType === 'instructorPost'
          ? comment.instructorPostId
          : comment.studentPostId;
      if (postIdField !== postId) {
        throw new NotFoundException('해당 게시글에서 댓글을 찾을 수 없습니다.');
      }
    }

    // 권한 검증
    if (userType === UserType.STUDENT) {
      // 학생: Enrollment의 appStudentId로 본인 확인
      if (!comment.enrollmentId) {
        throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다.');
      }
      const enrollment = await this.enrollmentsRepository.findById(
        comment.enrollmentId,
      );
      if (enrollment?.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다.');
      }
    } else if (userType === UserType.INSTRUCTOR) {
      // 강사: instructorId로 본인 확인
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      // 조교: assistantId로 본인 확인
      if (comment.assistantId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 삭제할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // 학부모: 현재는 댓글 삭제 권한 없음
      throw new ForbiddenException('학부모는 댓글을 삭제할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 삭제 권한이 없습니다.');
    }

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
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    // 댓글이 해당 게시글에 속하는지 검증 (REST semantics 준수)
    if (postId && postType) {
      const postIdField =
        postType === 'instructorPost'
          ? comment.instructorPostId
          : comment.studentPostId;
      if (postIdField !== postId) {
        throw new NotFoundException('해당 게시글에서 댓글을 찾을 수 없습니다.');
      }
    }

    // 권한 검증
    if (userType === UserType.STUDENT) {
      // 학생: Enrollment의 appStudentId로 본인 확인
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
      // 강사: instructorId로 본인 확인
      if (comment.instructorId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.ASSISTANT) {
      // 조교: assistantId로 본인 확인
      if (comment.assistantId !== profileId) {
        throw new ForbiddenException('본인의 댓글만 수정할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // 학부모: 현재는 댓글 수정 권한 없음
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 수정 권한이 없습니다.');
    }

    // 자료 소유권 검증 (새로 첨부할 자료가 있는 경우)
    if (data.materialIds && data.materialIds.length > 0) {
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
