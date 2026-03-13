import { Request, Response, NextFunction } from 'express';
import { EnrollmentsService } from '../services/enrollments.service.js';
import {
  GetEnrollmentsQueryDto,
  GetSvcEnrollmentsQueryDto,
} from '../validations/enrollments.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { UserType } from '../constants/auth.constant.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';

const ENROLLMENT_DATE_FIELDS = [
  'registeredAt',
  'createdAt',
  'updatedAt',
] as Array<keyof Record<string, unknown>>;

export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  /** 수강 목록 조회 핸들러 */
  getEnrollments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      // 강사/조교인 경우 (관리자 페이지 등에서 호출 시)
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        const query = req.query as unknown as GetEnrollmentsQueryDto;
        const { enrollments, totalCount } =
          await this.enrollmentsService.getEnrollments(
            userType,
            profileId,
            query,
          );

        const responseData = getPagingData(
          transformDateFieldsToKst<Record<string, unknown>>(
            enrollments as unknown as Record<string, unknown>[],
            ENROLLMENT_DATE_FIELDS,
          ),
          totalCount,
          query.page,
          query.limit,
        );

        return successResponse(res, {
          data: responseData,
          message: '수강 목록 조회 성공',
        });
      }

      // 학생/학부모인 경우
      const query = req.query as unknown as GetSvcEnrollmentsQueryDto;
      const { enrollments, totalCount } =
        await this.enrollmentsService.getMyEnrollments(
          userType,
          profileId,
          query,
        );

      const responseData = getPagingData(
        transformDateFieldsToKst<Record<string, unknown>>(
          enrollments as unknown as Record<string, unknown>[],
          ENROLLMENT_DATE_FIELDS,
        ),
        totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        data: responseData,
        message: '수강 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 강의별 수강생 목록 조회 핸들러 (New) */
  getEnrollmentsByLectureId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const query = req.query as unknown as GetEnrollmentsQueryDto;

      const { enrollments, totalCount } =
        await this.enrollmentsService.getEnrollmentsByLectureId(
          lectureId,
          userType,
          profileId,
          query,
        );

      const responseData = getPagingData(
        transformDateFieldsToKst<Record<string, unknown>>(
          enrollments as unknown as Record<string, unknown>[],
          ENROLLMENT_DATE_FIELDS,
        ),
        totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        data: responseData,
        message: '강의별 수강 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**  수강 상세 조회 핸들러 */
  getEnrollment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 강사/조교인 경우는 enrollmentId 또는 lectureEnrollmentId
      // 학생/학부모는 lectureEnrollmentId
      const { enrollmentId, lectureEnrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      let enrollment;

      // 강사/조교인 경우
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        if (enrollmentId) {
          enrollment = await this.enrollmentsService.getEnrollmentDetail(
            enrollmentId,
            userType,
            profileId,
          );
        } else if (lectureEnrollmentId) {
          enrollment =
            await this.enrollmentsService.getEnrollmentDetailByLectureEnrollmentId(
              lectureEnrollmentId,
              userType,
              profileId,
            );
        }
      } else {
        // 학생/학부모인 경우
        enrollment = await this.enrollmentsService.getEnrollmentById(
          lectureEnrollmentId,
          userType,
          profileId,
        );
      }

      const transformedEnrollment = transformDateFieldsToKst(
        enrollment as Record<string, unknown>,
        ENROLLMENT_DATE_FIELDS,
      ) as Record<string, unknown>;

      if (Array.isArray(transformedEnrollment.lectures)) {
        transformedEnrollment.lectures = transformDateFieldsToKst<
          Record<string, unknown>
        >(
          transformedEnrollment.lectures as Record<string, unknown>[],
          ENROLLMENT_DATE_FIELDS,
        );
      }

      if (
        transformedEnrollment.enrollment &&
        typeof transformedEnrollment.enrollment === 'object'
      ) {
        transformedEnrollment.enrollment = transformDateFieldsToKst(
          transformedEnrollment.enrollment as Record<string, unknown>,
          ENROLLMENT_DATE_FIELDS,
        );
      }

      return successResponse(res, {
        data: { enrollment: transformedEnrollment },
        message: '수강 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 학생용 특정 강사의 강의 목록 조회 핸들러 */
  getEnrollmentLectures = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const { lectureEnrollments } =
        await this.enrollmentsService.getEnrollmentLectures(
          enrollmentId,
          userType,
          profileId,
        );

      const transformedLectureEnrollments = transformDateFieldsToKst(
        lectureEnrollments as Record<string, unknown>[],
        ENROLLMENT_DATE_FIELDS,
      ) as Array<Record<string, unknown>>;

      transformedLectureEnrollments.forEach((lectureEnrollment) => {
        if (
          lectureEnrollment.lecture &&
          typeof lectureEnrollment.lecture === 'object'
        ) {
          lectureEnrollment.lecture = transformDateFieldsToKst(
            lectureEnrollment.lecture as Record<string, unknown>,
            ENROLLMENT_DATE_FIELDS,
          );
        }
      });

      return successResponse(res, {
        data: { lectureEnrollments: transformedLectureEnrollments },
        message: '강사별 강의 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  // Enrollment 생성
  createEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body;

      const enrollment = await this.enrollmentsService.createEnrollment(
        lectureId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: { enrollment },
        message: '수강 등록 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 수강 마이그레이션 핸들러 (일괄 등록) */
  createEnrollmentMigration = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body;

      const result = await this.enrollmentsService.createEnrollmentMigration(
        lectureId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: result,
        message: '수강 마이그레이션 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** Enrollment 수정 */
  updateEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body;

      const enrollment = await this.enrollmentsService.updateEnrollment(
        enrollmentId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: { enrollment },
        message: '수강 정보 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** Enrollment 삭제 (강의에서만 제거) */
  removeLectureEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId, enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.enrollmentsService.removeLectureEnrollment(
        lectureId,
        enrollmentId,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
        message: '수강생 삭제 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
