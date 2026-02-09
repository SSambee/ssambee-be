import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { UserType } from '../constants/auth.constant.js';
import { CommentsRepository } from '../repos/comments.repo.js';
import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { StudentPostsRepository } from '../repos/student-posts.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { PermissionService } from './permission.service.js';
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
    private readonly permissionService: PermissionService,
  ) {}

  /** 댓글 생성 */
  async createComment(
    data: CreateCommentDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 게시글 존재 여부 확인
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

    // 2. 작성자 정보 설정
    const writerInfo = {
      instructorId: userType === UserType.INSTRUCTOR ? profileId : null,
      assistantId: userType === UserType.ASSISTANT ? profileId : null,
      enrollmentId: null as string | null,
    };

    if (userType === UserType.STUDENT) {
      // 학생 Enrollment ID 찾기 로직 필요
      // 게시글이 속한 강의/강사에 연결된 Enrollment를 찾아야 함.
      // 여기서는 임시로 null 처리하거나, 별도 로직으로 주입해야 함.
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
  ) {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

    // 본인 댓글 or 게시글 작성자/관리자(강사) 권한 확인
    // 간단히 본인 댓글만 삭제 가능하게 구현
    if (
      userType === UserType.INSTRUCTOR &&
      comment.instructorId !== profileId
    ) {
      throw new ForbiddenException('삭제 권한이 없습니다.');
    }
    // ... 기타 타입 체크 ...

    return this.commentsRepository.delete(commentId);
  }

  /** 댓글 수정 */
  async updateComment(
    commentId: string,
    data: UpdateCommentDto,
    userType: UserType,
    profileId: string,
  ) {
    const comment = await this.commentsRepository.findById(commentId);
    if (!comment) throw new NotFoundException('댓글을 찾을 수 없습니다.');

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
    } else if (userType === UserType.PARENT) {
      // 학부모: 현재는 댓글 수정 권한 없음
      throw new ForbiddenException('학부모는 댓글을 수정할 수 없습니다.');
    } else {
      throw new ForbiddenException('댓글 수정 권한이 없습니다.');
    }

    return this.commentsRepository.update(commentId, { content: data.content });
  }
}
