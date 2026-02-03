import { Request, Response, NextFunction } from 'express';
import { AttendancesService } from '../services/attendances.service.js';
import {
  CreateBulkAttendancesDto,
  CreateAttendanceDto,
} from '../validations/attendances.validation.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';

// 출결 날짜는 단순 DATE만 직접 입력되므로 별도의 처리를 하면 오히려 데이터가 오염됨
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  /** 강의 내 단체 출결 등록 (배열) */
  createBulkAttendances = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body as CreateBulkAttendancesDto;

      const results = await this.attendancesService.createBulkAttendances(
        lectureId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: {
          count: results.length,
          attendances: transformDateFieldsToKst(results, [
            'enterTime',
            'leaveTime',
            'createdAt',
            'updatedAt',
          ]),
        },
        message: '출결이 성공적으로 등록되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 수강생 출결 등록 (단일) */
  createAttendance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // route: /lectures/:lectureId/enrollments/:enrollmentId/attendances
      const { lectureId, enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body as CreateAttendanceDto;

      const attendance = await this.attendancesService.createAttendance(
        lectureId,
        enrollmentId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: {
          attendance: transformDateFieldsToKst(attendance, [
            'enterTime',
            'leaveTime',
            'createdAt',
            'updatedAt',
          ]),
        },
        message: '출결이 등록되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 수강생 출결 조회 + 통계 */
  getAttendances = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lectureId, enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const { attendances, stats } =
        await this.attendancesService.getAttendancesByLectureEnrollment(
          lectureId,
          enrollmentId,
          userType,
          profileId,
        );

      return successResponse(res, {
        data: {
          stats,
          attendances: transformDateFieldsToKst(attendances, [
            'enterTime',
            'leaveTime',
            'createdAt',
            'updatedAt',
          ]),
        },
        message: '출결 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
