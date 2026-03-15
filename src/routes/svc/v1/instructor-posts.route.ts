import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  getInstructorPostsQuerySchema,
  instructorPostParamsSchema,
} from '../../../validations/instructor-posts.validation.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentEditParamsSchema,
} from '../../../validations/comments.validation.js';
import { upload } from '../../../middlewares/multer.middleware.js';

export const svcInstructorPostsRouter = Router({ mergeParams: true });

const {
  instructorPostsController,
  commentsController,
  requireAuth,
  requireStudentOrParent,
} = container;

svcInstructorPostsRouter.use(requireAuth);
svcInstructorPostsRouter.use(requireStudentOrParent);

/** 목록 조회 */
svcInstructorPostsRouter.get(
  '/',
  validate(getInstructorPostsQuerySchema, 'query'),
  instructorPostsController.getPostList,
);

/** 상세 조회 */
svcInstructorPostsRouter.get(
  '/:postId',
  validate(instructorPostParamsSchema, 'params'),
  instructorPostsController.getPostDetail,
);

/** 댓글 작성 (학생/학부모) */
svcInstructorPostsRouter.post(
  '/:postId/comments',
  upload.single('file'),
  validate(instructorPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);

/** 댓글 목록 조회 (성능 이슈시추후 분리 예정) */
// svcInstructorPostsRouter.get(
//   '/:postId/comments',
//   validate(instructorPostParamsSchema, 'params'),
//   commentsController.getCommentList,
// );

/** 댓글 수정 (본인만 가능) */
svcInstructorPostsRouter.patch(
  '/:postId/comments/:commentId',
  upload.single('file'),
  validate(commentEditParamsSchema, 'params'),
  validate(updateCommentSchema, 'body'),
  commentsController.updateComment,
);

/** 댓글 삭제 (본인만 가능) */
svcInstructorPostsRouter.delete(
  '/:postId/comments/:commentId',
  validate(commentEditParamsSchema, 'params'),
  commentsController.deleteComment,
);
