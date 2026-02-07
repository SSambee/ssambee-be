import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createInstructorPostSchema,
  updateInstructorPostSchema,
  getInstructorPostsQuerySchema,
  instructorPostParamsSchema,
} from '../../../validations/instructor-posts.validation.js';
import { createCommentSchema } from '../../../validations/comments.validation.js';

export const mgmtInstructorPostsRouter = Router({ mergeParams: true });

const {
  instructorPostsController,
  commentsController,
  requireAuth,
  requireInstructorOrAssistant,
} = container;

mgmtInstructorPostsRouter.use(requireAuth);
mgmtInstructorPostsRouter.use(requireInstructorOrAssistant);

/**
 * Prefix:
 * 1. /api/mgmt/v1/lectures/:lectureId/instructor-posts (강의별 공지)
 * 2. /api/mgmt/v1/instructor-posts (전체 공지 관리)
 */

/** 공지 생성 */
mgmtInstructorPostsRouter.post(
  '/',
  validate(createInstructorPostSchema, 'body'),
  instructorPostsController.createPost,
);

/** 공지 목록 조회 */
mgmtInstructorPostsRouter.get(
  '/',
  validate(getInstructorPostsQuerySchema, 'query'),
  instructorPostsController.getPostList,
);

/** 공지 상세 조회 */
mgmtInstructorPostsRouter.get(
  '/:postId',
  validate(instructorPostParamsSchema, 'params'),
  instructorPostsController.getPostDetail,
);

/** 공지 수정 */
mgmtInstructorPostsRouter.patch(
  '/:postId',
  validate(instructorPostParamsSchema, 'params'),
  validate(updateInstructorPostSchema, 'body'),
  instructorPostsController.updatePost,
);

/** 공지 삭제 */
mgmtInstructorPostsRouter.delete(
  '/:postId',
  validate(instructorPostParamsSchema, 'params'),
  instructorPostsController.deletePost,
);

/** 댓글 작성 (강사/조교) */
mgmtInstructorPostsRouter.post(
  '/:postId/comments',
  validate(instructorPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);
