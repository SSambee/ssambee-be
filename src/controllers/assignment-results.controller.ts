import { Request, Response, NextFunction } from 'express';
import { AssignmentResultsService } from '../services/assignment-results.service.js';
import { successResponse } from '../utils/response.util.js';
import { getInstructorIdOrThrow } from '../utils/user.util.js';
import {
  CreateAssignmentResultDto,
  UpdateAssignmentResultDto,
} from '../validations/assignment-results.validation.js';

export class AssignmentResultsController {
  constructor(
    private readonly assignmentResultsService: AssignmentResultsService,
  ) {}

  /** 과제 결과 생성 */
  createResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId, lectureEnrollmentId } = req.params;
      const data = req.body as CreateAssignmentResultDto;

      const result = await this.assignmentResultsService.createResult(
        instructorId,
        assignmentId,
        lectureEnrollmentId,
        data,
      );

      return successResponse(res, {
        statusCode: 201,
        message: '과제 결과가 생성되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 결과 조회 */
  getResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId, lectureEnrollmentId } = req.params;

      const result = await this.assignmentResultsService.getResult(
        instructorId,
        assignmentId,
        lectureEnrollmentId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 결과 수정 */
  updateResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId, lectureEnrollmentId } = req.params;
      const data = req.body as UpdateAssignmentResultDto;

      const result = await this.assignmentResultsService.updateResult(
        instructorId,
        assignmentId,
        lectureEnrollmentId,
        data,
      );

      return successResponse(res, {
        message: '과제 결과가 수정되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 결과 삭제 */
  deleteResult = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId, lectureEnrollmentId } = req.params;

      await this.assignmentResultsService.deleteResult(
        instructorId,
        assignmentId,
        lectureEnrollmentId,
      );

      return successResponse(res, {
        message: '과제 결과가 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
