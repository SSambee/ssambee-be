import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createStudentPostSchema,
  updateStudentPostStatusSchema,
  getStudentPostsQuerySchema,
  studentPostParamsSchema,
  updateStudentPostSchema,
} from '../../../validations/student-posts.validation.js';
import {
  createCommentSchema,
  updateCommentSchema,
  commentEditParamsSchema,
} from '../../../validations/comments.validation.js';

export const svcStudentPostsRouter = Router();

// TODO: requireStudentOrParent 미들웨어 필요. 현재는 requireStudent만 사용
// const { requireStudentOrParent } = createRoleMiddlewares(); 같은 형태가 이상적

const {
  studentPostsController,
  commentsController,
  requireAuth,
  requireStudentOrParent,
} = container;

svcStudentPostsRouter.use(requireAuth);
svcStudentPostsRouter.use(requireStudentOrParent);

/** 질문 생성 */
svcStudentPostsRouter.post(
  '/',
  validate(createStudentPostSchema, 'body'),
  studentPostsController.createPost,
);

/** 내 질문 목록 조회 */
svcStudentPostsRouter.get(
  '/',
  validate(getStudentPostsQuerySchema, 'query'),
  studentPostsController.getPostList,
);

/** 질문 상세 조회 */
svcStudentPostsRouter.get(
  '/:postId',
  validate(studentPostParamsSchema, 'params'),
  studentPostsController.getPostDetail,
);

/** 질문 수정 */
svcStudentPostsRouter.patch(
  '/:postId',
  validate(studentPostParamsSchema, 'params'),
  validate(updateStudentPostSchema, 'body'),
  studentPostsController.updatePost,
);

/** 질문 삭제 */
svcStudentPostsRouter.delete(
  '/:postId',
  validate(studentPostParamsSchema, 'params'),
  studentPostsController.deletePost,
);

/** 질문 상태 변경 (학생이 해결 완료 처리) */
svcStudentPostsRouter.patch(
  '/:postId/status',
  validate(studentPostParamsSchema, 'params'),
  validate(updateStudentPostStatusSchema, 'body'),
  studentPostsController.updateStatus,
);

// 학생/학부모도 본인 질문에 추가 댓글(재질문) 가능
svcStudentPostsRouter.post(
  '/:postId/comments',
  validate(studentPostParamsSchema, 'params'),
  validate(createCommentSchema, 'body'),
  commentsController.createComment,
);

/** 댓글 수정 (본인만 가능) */
svcStudentPostsRouter.patch(
  '/:postId/comments/:commentId',
  validate(commentEditParamsSchema, 'params'),
  validate(updateCommentSchema, 'body'),
  commentsController.updateComment,
);

/** 댓글 삭제 (본인만 가능) */
svcStudentPostsRouter.delete(
  '/:postId/comments/:commentId',
  validate(commentEditParamsSchema, 'params'),
  commentsController.deleteComment,
);
