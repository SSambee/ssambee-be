import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  // updateStudentPostStatusSchema,
  getStudentPostsQuerySchema,
  studentPostParamsSchema,
  attachmentParamsSchema,
} from '../../../validations/student-posts.validation.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentEditParamsSchema,
} from '../../../validations/comments.validation.js';

import { upload } from '../../../middlewares/multer.middleware.js';

export const mgmtStudentPostsRouter = Router();

const {
  studentPostsController,
  commentsController,
  requireAuth,
  requireInstructorOrAssistant,
} = container;

mgmtStudentPostsRouter.use(requireAuth);
mgmtStudentPostsRouter.use(requireInstructorOrAssistant);
mgmtStudentPostsRouter.use(container.requireActiveInstructorEntitlement);

/** 질문 목록 조회 (관리자용) */
mgmtStudentPostsRouter.get(
  '/',
  validate(getStudentPostsQuerySchema, 'query'),
  studentPostsController.getPostList,
);

/** 게시글 첨부파일 다운로드 URL 조회 */
mgmtStudentPostsRouter.get(
  '/attachments/:attachmentId/download-url',
  validate(attachmentParamsSchema, 'params'),
  studentPostsController.getAttachmentDownloadUrl,
);

/** 댓글 첨부파일 다운로드 URL 조회 */
mgmtStudentPostsRouter.get(
  '/comments/attachments/:attachmentId/download-url',
  validate(attachmentParamsSchema, 'params'),
  commentsController.getAttachmentDownloadUrl,
);

/** 질문 상세 조회 */
mgmtStudentPostsRouter.get(
  '/:postId',
  validate(studentPostParamsSchema, 'params'),
  studentPostsController.getPostDetail,
);

/** 질문 상태 변경 (완료 처리) */
// mgmtStudentPostsRouter.patch(
//   '/:postId/status',
//   validate(studentPostParamsSchema, 'params'),
//   validate(updateStudentPostStatusSchema, 'body'),
//   studentPostsController.updateStatus,
// );

/** 답변(댓글) 작성 */
mgmtStudentPostsRouter.post(
  '/:postId/comments',
  upload.single('file'),
  validate(studentPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);

/** 답변(댓글) 수정 */
mgmtStudentPostsRouter.patch(
  '/:postId/comments/:commentId',
  upload.single('file'),
  validate(commentEditParamsSchema, 'params'),
  validate(updateCommentSchema, 'body'),
  commentsController.updateComment,
);

/** 답변(댓글) 삭제 */
mgmtStudentPostsRouter.delete(
  '/:postId/comments/:commentId',
  validate(commentEditParamsSchema, 'params'),
  commentsController.deleteComment,
);
