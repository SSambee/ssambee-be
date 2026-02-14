import { NextFunction, Request, Response } from 'express';
import { StudentPostsService } from '../services/student-posts.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import {
  CreateStudentPostDto,
  UpdateStudentPostStatusDto,
  GetStudentPostsQueryDto,
  UpdateStudentPostDto,
} from '../validations/student-posts.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';
import { StudentPostWithDetails } from '../repos/student-posts.repo.js';

export class StudentPostsController {
  constructor(private readonly studentPostsService: StudentPostsService) {}

  /** 질문 생성 */
  createPost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req.body as CreateStudentPostDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.studentPostsService.createPost(
        data,
        userType,
        profileId,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 201,
        data: kstResult,
        message: '질문이 성공적으로 등록되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 목록 조회 */
  getPostList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as GetStudentPostsQueryDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.studentPostsService.getPostList(
        query,
        userType,
        profileId,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstPosts = transformDateFieldsToKst(result.posts, [
        'createdAt',
        'updatedAt',
      ]);

      const postsWithIsMine = (kstPosts as StudentPostWithDetails[]).map(
        (post) => ({
          ...post,
          isMine:
            userType === UserType.STUDENT
              ? post.enrollment?.appStudentId === profileId
              : userType === UserType.PARENT
                ? post.enrollment?.appParentLink?.appParentId === profileId
                : false,
        }),
      );

      const responseData = getPagingData(
        postsWithIsMine,
        result.totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        statusCode: 200,
        data: responseData,
        message: '질문 목록을 조회했습니다.',
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

      const result = await this.studentPostsService.getPostDetail(
        postId,
        userType,
        profileId,
      );

      const rawResult = result;
      if (rawResult.comments) {
        rawResult.comments = transformDateFieldsToKst(rawResult.comments, [
          'createdAt',
          'updatedAt',
        ]);
      }

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(rawResult, [
        'createdAt',
        'updatedAt',
      ]);

      const responseWithIsMine = {
        ...kstResult,
        isMine:
          userType === UserType.STUDENT
            ? (kstResult as StudentPostWithDetails).enrollment?.appStudentId ===
              profileId
            : userType === UserType.PARENT
              ? (kstResult as StudentPostWithDetails).enrollment?.appParentLink
                  ?.appParentId === profileId
              : false,
      };

      return successResponse(res, {
        statusCode: 200,
        data: responseWithIsMine,
        message: '질문 상세 정보를 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 질문 상태 변경 (학생이 확인 완료 처리)
   * flow: PENDING (BEFORE) -> RESOLVED (REGISTERED) -> COMPLETED (COMPLETED)
   */
  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const data = req.body as UpdateStudentPostStatusDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.studentPostsService.updateStatus(
        postId,
        data.status,
        userType,
        profileId,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 200,
        data: kstResult,
        message: '질문 상태를 변경했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 질문 수정 */
  updatePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const data = req.body as UpdateStudentPostDto;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.studentPostsService.updatePost(
        postId,
        data,
        userType,
        profileId,
      );

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 200,
        data: kstResult,
        message: '질문을 수정했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 질문 삭제 */
  deletePost = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { postId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      await this.studentPostsService.deletePost(postId, userType, profileId);

      return successResponse(res, {
        statusCode: 200,
        data: null,
        message: '질문을 삭제했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
