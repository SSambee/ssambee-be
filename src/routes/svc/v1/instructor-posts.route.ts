import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  getInstructorPostsQuerySchema,
  instructorPostParamsSchema,
} from '../../../validations/instructor-posts.validation.js';
import { createCommentSchema } from '../../../validations/comments.validation.js';

export const svcInstructorPostsRouter = Router({ mergeParams: true });

const {
  instructorPostsController,
  commentsController,
  requireAuth,
  requireStudent,
} = container;

svcInstructorPostsRouter.use(requireAuth);
svcInstructorPostsRouter.use(requireStudent);

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
  validate(instructorPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);
