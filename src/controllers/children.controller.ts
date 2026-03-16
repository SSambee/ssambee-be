import { Request, Response, NextFunction } from 'express';
import { ParentsService } from '../services/parents.service.js';
import { GradesService } from '../services/grades.service.js';
import { ClinicsService } from '../services/clinics.service.js';
import { UserType } from '../constants/auth.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import type { GetSvcEnrollmentsQueryDto } from '../validations/enrollments.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { successResponse } from '../utils/response.util.js';

export class ChildrenController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly gradesService: GradesService,
    private readonly clinicsService: ClinicsService,
  ) {}

  /** 자녀 등록 */
  registerChild = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const child = await this.parentsService.registerChild(
        user.userType as UserType,
        profileId,
        req.body,
      );

      return successResponse(res, {
        statusCode: 201,
        data: child,
        message: '자녀 등록 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀의 강사별 강의 목록 조회 */
  getChildEnrollmentLectures = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const { id, enrollmentId } = req.params;
      const { lectureEnrollments } =
        await this.parentsService.getChildEnrollmentLectures(
          user.userType as UserType,
          profileId,
          id,
          enrollmentId,
        );

      return successResponse(res, {
        data: { lectureEnrollments },
        message: '자녀의 강사별 강의 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 목록 조회 */
  getChildren = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const children = await this.parentsService.getChildren(
        user.userType as UserType,
        profileId,
      );

      return successResponse(res, {
        data: children,
        message: '자녀 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 수강 목록 조회 */
  getChildEnrollments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const { id } = req.params;
      const query = req.query as unknown as GetSvcEnrollmentsQueryDto;

      const { enrollments, totalCount } =
        await this.parentsService.getChildEnrollments(
          user.userType as UserType,
          profileId,
          id,
          query,
        );

      const responseData = getPagingData(
        enrollments,
        totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        data: responseData,
        message: '자녀 수강 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 수강 상세 조회 */
  getChildEnrollmentDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const { id, lectureEnrollmentId } = req.params;
      const enrollment = await this.parentsService.getChildEnrollmentDetail(
        user.userType as UserType,
        profileId,
        id,
        lectureEnrollmentId,
      );

      return successResponse(res, {
        data: enrollment,
        message: '자녀 수강 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀의 수강별 성적 목록 조회 */
  getChildGradesByEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const { id, lectureEnrollmentId } = req.params;

      // 1. 자녀 링크 검증
      const childLink = await this.parentsService.getChildren(
        user.userType as UserType,
        profileId,
      );
      const targetChild = childLink.find((child) => child.id === id);
      if (!targetChild) {
        throw new NotFoundException('자녀 정보를 찾을 수 없습니다.');
      }

      // 2. 성적 목록 조회 (학부모 권한으로)
      const result = await this.gradesService.getGradesByLectureEnrollment(
        lectureEnrollmentId,
        user.userType as UserType,
        profileId,
      );

      return successResponse(res, {
        data: { grades: result },
        message: '자녀 성적 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀의 성적 상세 조회 */
  getChildGradeDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const { id, gradeId } = req.params;

      // 1. 자녀 링크 검증
      const childLink = await this.parentsService.getChildren(
        user.userType as UserType,
        profileId,
      );
      const targetChild = childLink.find((child) => child.id === id);
      if (!targetChild) {
        throw new NotFoundException('자녀 정보를 찾을 수 없습니다.');
      }

      // 2. 성적 상세 조회 (학부모 권한으로)
      const result = await this.gradesService.getGradeDetail(
        gradeId,
        user.userType as UserType,
        profileId,
      );

      return successResponse(res, {
        data: { grade: result },
        message: '자녀 성적 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀의 클리닉 목록 조회 */
  getChildClinics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const { id } = req.params;

      // 1. 자녀 링크 검증 및 appStudentId 추출
      const childLink = await this.parentsService.getChildren(
        user.userType as UserType,
        profileId,
      );
      const targetChild = childLink.find((child) => child.id === id);
      if (!targetChild) {
        throw new NotFoundException('자녀 정보를 찾을 수 없습니다.');
      }

      // 2. 클리닉 조회 (자녀 링크 ID로)
      const result = await this.clinicsService.getClinicsByParentLink(
        id,
        user.userType as UserType,
        profileId,
      );

      return successResponse(res, {
        data: { clinics: result },
        message: '자녀 클리닉 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
