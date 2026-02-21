import { NextFunction, Request, Response } from 'express';
import { CommentsService } from '../services/comments.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import {
  CreateCommentDto,
  UpdateCommentDto,
} from '../validations/comments.validation.js';

export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** 댓글 생성 */
  createComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateCommentDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      // URL 파라미터 병합 (라우트 설정에 따라 다름)
      if (req.params.postId) {
        // 라우트가 /instructor-posts/:postId/comments 인지 /student-posts/:postId/comments 인지 구분 (방어코드)
        if (req.baseUrl.includes('instructor-posts')) {
          data.instructorPostId = req.params.postId;
          data.studentPostId = undefined; // 반대쪽 필드 제거
        } else if (req.baseUrl.includes('student-posts')) {
          data.studentPostId = req.params.postId;
          data.instructorPostId = undefined; // 반대쪽 필드 제거
        }
      }

      const files = req.files
        ? (req.files as Express.Multer.File[])
        : req.file
          ? [req.file as Express.Multer.File]
          : undefined;

      const result = await this.commentsService.createComment(
        data,
        userType,
        profileId,
        files,
      );

      return successResponse(res, {
        statusCode: 201,
        data: result,
        message: '댓글이 등록되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 댓글 삭제 */
  deleteComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId, commentId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      // URL에서 post 타입 파악 (instructor-posts 또는 student-posts)
      const postType = req.baseUrl.includes('instructor-posts')
        ? 'instructorPost'
        : req.baseUrl.includes('student-posts')
          ? 'studentPost'
          : null;

      await this.commentsService.deleteComment(
        commentId,
        userType,
        profileId,
        postId,
        postType,
      );

      return successResponse(res, {
        statusCode: 200,
        data: null,
        message: '댓글을 삭제했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 댓글 수정 */
  updateComment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId, commentId } = req.params;
      const data = req.body as UpdateCommentDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      // URL에서 post 타입 파악
      const postType = req.baseUrl.includes('instructor-posts')
        ? 'instructorPost'
        : req.baseUrl.includes('student-posts')
          ? 'studentPost'
          : null;

      const result = await this.commentsService.updateComment(
        commentId,
        data,
        userType,
        profileId,
        postId,
        postType,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '댓글을 수정했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 첨부파일 다운로드 URL 조회 */
  getAttachmentDownloadUrl = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { attachmentId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.commentsService.getAttachmentDownloadUrl(
        attachmentId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '다운로드 URL을 생성했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
