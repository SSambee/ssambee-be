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
        // 라우트가 /instructor-posts/:postId/comments 인지 /student-posts/:postId/comments 인지 구분 필요
        // 혹은 미들웨어나 라우트 분기에서 data에 주입
        // 여기서는 body Validation이 필드를 요구하므로, 클라이언트가 body에 ID를 포함한다고 가정하거나
        // 라우트별 핸들러를 분리하는 것이 좋을 수 있음.

        // 하지만 지금은 하나의 createComment 메서드로 처리하고, params를 확인하여 body에 주입
        if (req.baseUrl.includes('instructor-posts')) {
          data.instructorPostId = req.params.postId;
        } else if (req.baseUrl.includes('student-posts')) {
          data.studentPostId = req.params.postId;
        }
      }

      const result = await this.commentsService.createComment(
        data,
        userType,
        profileId,
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
      const { commentId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      await this.commentsService.deleteComment(commentId, userType, profileId);

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
      const { commentId } = req.params;
      const data = req.body as UpdateCommentDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.commentsService.updateComment(
        commentId,
        data,
        userType,
        profileId,
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
}
