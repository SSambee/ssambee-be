import { Request, Response, NextFunction } from 'express';
import { AssignmentsService } from '../services/assignments.service.js';
import { successResponse } from '../utils/response.util.js';
import { getInstructorIdOrThrow } from '../utils/user.util.js';
import {
  CreateAssignmentDto,
  GetAssignmentsQueryDto,
  UpdateAssignmentDto,
} from '../validations/assignments.validation.js';

export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  /** 과제 생성 */
  createAssignment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { lectureId } = req.params;
      const data = req.body as CreateAssignmentDto;

      const result = await this.assignmentsService.createAssignment(
        instructorId,
        lectureId,
        data,
      );

      return successResponse(res, {
        statusCode: 201,
        message: '과제가 생성되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 목록 조회 */
  getAssignments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const query = req.query as unknown as GetAssignmentsQueryDto;

      const result = await this.assignmentsService.getAssignments(
        instructorId,
        query.lectureId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 단일 조회 */
  getAssignmentById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId } = req.params;

      const result = await this.assignmentsService.getAssignmentById(
        assignmentId,
        instructorId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 수정 */
  updateAssignment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId } = req.params;
      const data = req.body as UpdateAssignmentDto;

      const result = await this.assignmentsService.updateAssignment(
        assignmentId,
        instructorId,
        data,
      );

      return successResponse(res, {
        message: '과제가 수정되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 과제 삭제 */
  deleteAssignment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { assignmentId } = req.params;

      await this.assignmentsService.deleteAssignment(
        assignmentId,
        instructorId,
      );

      return successResponse(res, {
        message: '과제가 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
