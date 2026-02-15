import { NextFunction, Request, Response } from 'express';
import { InstructorPostsService } from '../services/instructor-posts.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import {
  CreateInstructorPostDto,
  UpdateInstructorPostDto,
  GetInstructorPostsQueryDto,
} from '../validations/instructor-posts.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';
import { InstructorPostWithDetails } from '../repos/instructor-posts.repo.js';

export class InstructorPostsController {
  constructor(
    private readonly instructorPostsService: InstructorPostsService,
  ) {}

  /** 공지 타겟 학생 목록 조회 (강사의 모든 강의와 학생 목록) */
  getPostTargets = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.instructorPostsService.getPostTargets(
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '공지 타겟 목록을 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 공지 생성 */
  createPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateInstructorPostDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      // params의 lectureId가 있다면 body에 병합 (우선순위 고려)
      if (req.params.lectureId && !data.lectureId) {
        data.lectureId = req.params.lectureId;
      }

      const result = await this.instructorPostsService.createPost(
        data,
        profileId,
        userType,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 201,
        data: kstResult,
        message: '공지가 성공적으로 등록되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 목록 조회 */
  getPostList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetInstructorPostsQueryDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.instructorPostsService.getPostList(
        query,
        userType,
        profileId,
      );

      // posts 배열 변환 (comments가 포함되어 있다면 중첩 변환)
      // 날짜 데이터를 한국 시간으로 변환
      const kstPosts = transformDateFieldsToKst(
        result.posts as unknown as Record<string, unknown>[],
        ['createdAt', 'updatedAt'],
      );

      const responseData = getPagingData(
        kstPosts,
        result.totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        statusCode: 200,
        data: {
          ...responseData,
          stats: result.stats,
        },
        message: '공지 목록을 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 상세 조회 */
  getPostDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.instructorPostsService.getPostDetail(
        postId,
        userType,
        profileId,
      );

      const rawResult = result as unknown as Record<string, unknown>;
      if (rawResult.comments) {
        rawResult.comments = transformDateFieldsToKst(
          rawResult.comments as Record<string, unknown>[],
          ['createdAt', 'updatedAt'],
        );
      }

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(rawResult, [
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 200,
        data: kstResult,
        message: '공지 상세 정보를 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 수정 */
  updatePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const data = req.body as UpdateInstructorPostDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.instructorPostsService.updatePost(
        postId,
        data,
        userType,
        profileId,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = result
        ? transformDateFieldsToKst(result, ['createdAt', 'updatedAt'])
        : null;

      return successResponse(res, {
        statusCode: 200,
        data: kstResult,
        message: '공지 정보를 수정했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 삭제 */
  deletePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      await this.instructorPostsService.deletePost(postId, userType, profileId);

      return successResponse(res, {
        statusCode: 200,
        data: null,
        message: '공지를 삭제했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
