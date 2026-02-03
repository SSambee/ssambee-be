import { Request, Response, NextFunction } from 'express';
import { LecturesService } from '../services/lectures.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';

export class LecturesController {
  constructor(private readonly lecturesService: LecturesService) {}

  /** 강의 생성 핸들러 */
  createLecture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const lectureData = req.body;

      const lecture = await this.lecturesService.createLecture(
        instructorId,
        lectureData,
      );

      return successResponse(res, {
        statusCode: 201,
        data: transformDateFieldsToKst(lecture, [
          'startAt',
          'endAt',
          'createdAt',
          'updatedAt',
          'deletedAt',
        ]),
        message: '강의 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 강의 리스트 조회 핸들러 */
  getLectures = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, search, day } = req.query;
      const instructorId = getProfileIdOrThrow(req);

      //  타입변환
      const result = await this.lecturesService.getLectures(instructorId, {
        page: Number(page) || 1,
        limit: Number(limit) || 4,
        search: search ? String(search) : undefined,
        day: day !== undefined ? Number(day) : undefined,
      });

      return successResponse(res, {
        data: {
          ...result,
          lectures: transformDateFieldsToKst(result.lectures, [
            'startAt',
            'createdAt',
            'updatedAt',
          ]),
        },
        message: '강의 리스트 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 강의 개별 조회 핸들러 */
  getLecture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const { id } = req.params;

      const lecture = await this.lecturesService.getLectureById(
        profileId,
        userType,
        id,
      );

      // exams 내부의 createdAt 등은 현재 타입에 없으나 안전하게 처리
      const transformedLecture = transformDateFieldsToKst(lecture, [
        'startAt',
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        data: transformedLecture,
        message: '강의 개별 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 강의 수정 핸들러 */
  updateLecture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const updateData = req.body;

      const lecture = await this.lecturesService.updateLecture(
        profileId,
        userType,
        id,
        updateData,
      );

      return successResponse(res, {
        data: transformDateFieldsToKst(lecture, [
          'startAt',
          'endAt',
          'createdAt',
          'updatedAt',
        ]),
        message: '강의 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 강의 삭제 핸들러 (Soft Delete) */
  deleteLecture = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const { id } = req.params;

      await this.lecturesService.deleteLecture(profileId, userType, id);

      return successResponse(res, {
        statusCode: 204,
        message: '강의 삭제 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
