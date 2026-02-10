import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  updateStudentPostStatusSchema,
  getStudentPostsQuerySchema,
  studentPostParamsSchema,
} from '../../../validations/student-posts.validation.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentEditParamsSchema,
} from '../../../validations/comments.validation.js';

export const mgmtStudentPostsRouter = Router();

const {
  studentPostsController,
  commentsController,
  requireAuth,
  requireInstructorOrAssistant,
} = container;

mgmtStudentPostsRouter.use(requireAuth);
mgmtStudentPostsRouter.use(requireInstructorOrAssistant);

/** 질문 목록 조회 (관리자용) */
mgmtStudentPostsRouter.get(
  '/',
  validate(getStudentPostsQuerySchema, 'query'),
  studentPostsController.getPostList,
);

/** 질문 상세 조회 */
mgmtStudentPostsRouter.get(
  '/:postId',
  validate(studentPostParamsSchema, 'params'),
  studentPostsController.getPostDetail,
);

/** 질문 상태 변경 (해결/미해결) */
mgmtStudentPostsRouter.patch(
  '/:postId/status',
  validate(studentPostParamsSchema, 'params'),
  validate(updateStudentPostStatusSchema, 'body'),
  studentPostsController.updateStatus,
);

/** 답변(댓글) 작성 */
mgmtStudentPostsRouter.post(
  '/:postId/comments',
  validate(studentPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);

/** 답변(댓글) 수정 */
mgmtStudentPostsRouter.patch(
  '/:postId/comments/:commentId',
  validate(commentEditParamsSchema, 'params'),
  validate(updateCommentSchema, 'body'),
  commentsController.updateComment,
);
