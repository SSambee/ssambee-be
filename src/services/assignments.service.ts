import { PrismaClient } from '../generated/prisma/client.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import {
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';

export class AssignmentsService {
  constructor(
    private readonly assignmentsRepo: AssignmentsRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 과제 생성 */
  async createAssignment(
    instructorId: string,
    lectureId: string,
    data: { title: string; resultPresets: string[] },
  ) {
    // 강의 존재 여부 확인은 FK 제약조건에 의해 처리되거나, 필요한 경우 추가로 구현 가능
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
    data: { title?: string; resultPresets?: string[] },
  ) {
    // 1. 과제 존재 및 권한 확인
    const assignment = await this.assignmentsRepo.findById(id);
    if (!assignment) {
      throw new NotFoundException('과제를 찾을 수 없습니다.');
    }
    if (assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
    }

    // 2. 업데이트
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
