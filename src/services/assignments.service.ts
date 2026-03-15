import { PrismaClient } from '../generated/prisma/client.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { AssignmentCategoryRepository } from '../repos/assignment-categories.repo.js';
import {
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';

export class AssignmentsService {
  constructor(
    private readonly assignmentsRepo: AssignmentsRepository,
    private readonly assignmentCategoryRepo: AssignmentCategoryRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 과제 생성 */
  async createAssignment(
    instructorId: string,
    lectureId: string,
    data: { title: string; categoryId: string },
  ) {
    // 1. 카테고리 존재 및 권한 확인
    const category = await this.assignmentCategoryRepo.findById(
      data.categoryId,
    );
    if (!category) {
      throw new NotFoundException('카테고리를 찾을 수 없습니다.');
    }
    if (category.instructorId !== instructorId) {
      throw new ForbiddenException('해당 카테고리에 대한 권한이 없습니다.');
    }

    // 2. 과제 생성
    // 강의 존재 여부 확인은 FK 제약조건에 의해 처리되거나, 필요한 경우 추가
    // 여기서는 간단히 진행
    return await this.assignmentsRepo.create({
      instructorId,
      lectureId,
      ...data,
    });
  }

  /** 강사의 과제 목록 조회 */
  async getAssignments(instructorId: string, lectureId?: string) {
    return this.assignmentsRepo.findByInstructorId(instructorId, lectureId);
  }

  /** 과제 단일 조회 (결과 포함) */
  async getAssignmentById(id: string, instructorId: string) {
    const assignment = await this.assignmentsRepo.findByIdWithResults(id);
    if (!assignment) {
      throw new NotFoundException('과제를 찾을 수 없습니다.');
    }
    // 권한 확인
    if (assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
    }
    return assignment;
  }

  /** 과제 수정 */
  async updateAssignment(
    id: string,
    instructorId: string,
    data: { title?: string; categoryId?: string },
  ) {
    // 1. 과제 존재 및 권한 확인
    const assignment = await this.assignmentsRepo.findById(id);
    if (!assignment) {
      throw new NotFoundException('과제를 찾을 수 없습니다.');
    }
    if (assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
    }

    // 2. 카테고리 변경 시 검증
    if (data.categoryId && data.categoryId !== assignment.categoryId) {
      const category = await this.assignmentCategoryRepo.findById(
        data.categoryId,
      );
      if (!category) {
        throw new NotFoundException('변경하려는 카테고리를 찾을 수 없습니다.');
      }
      if (category.instructorId !== instructorId) {
        throw new ForbiddenException(
          '변경하려는 카테고리에 대한 권한이 없습니다.',
        );
      }
    }

    // 3. 업데이트
    return await this.assignmentsRepo.update(id, data);
  }

  /** 과제 삭제 */
  async deleteAssignment(id: string, instructorId: string) {
    // 1. 과제 존재 및 권한 확인
    const assignment = await this.assignmentsRepo.findById(id);
    if (!assignment) {
      throw new NotFoundException('과제를 찾을 수 없습니다.');
    }
    if (assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
    }

    // 2. 삭제
    return await this.assignmentsRepo.delete(id);
  }
}
