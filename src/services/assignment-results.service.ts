import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { AssignmentResultsRepository } from '../repos/assignment-results.repo.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '../err/http.exception.js';

export class AssignmentResultsService {
  constructor(
    private readonly assignmentResultsRepo: AssignmentResultsRepository,
    private readonly assignmentsRepo: AssignmentsRepository,
    private readonly lectureEnrollmentsRepo: LectureEnrollmentsRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 과제 결과 생성 */
  async createResult(
    instructorId: string,
    assignmentId: string,
    lectureEnrollmentId: string,
    data: { resultIndex: number },
  ) {
    // 1. Assignment 존재 및 권한 확인
    const assignment = await this.assignmentsRepo.findById(assignmentId);
    if (!assignment) {
      throw new NotFoundException('과제를 찾을 수 없습니다.');
    }
    if (assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
    }

    // 2. LectureEnrollment 존재 확인
    const lectureEnrollment =
      await this.lectureEnrollmentsRepo.findById(lectureEnrollmentId);
    if (!lectureEnrollment) {
      throw new NotFoundException('수강생을 찾을 수 없습니다.');
    }

    // 3. Assignment와 LectureEnrollment가 같은 Lecture 소속인지 확인
    if (assignment.lectureId !== lectureEnrollment.lectureId) {
      throw new BadRequestException(
        '과제와 수강생이 같은 강의에 속하지 않습니다.',
      );
    }

    // 4. resultIndex 유효성 검증 (카테고리의 presets 배열 범위 내)
    const categoryPresetsLength = assignment.category.resultPresets.length;
    if (data.resultIndex >= categoryPresetsLength) {
      throw new BadRequestException(
        `resultIndex는 0부터 ${categoryPresetsLength - 1} 사이여야 합니다.`,
      );
    }

    // 5. 중복 체크 (unique 제약으로 이미 처리되지만 명시적으로)
    const existing =
      await this.assignmentResultsRepo.findByAssignmentAndEnrollment(
        assignmentId,
        lectureEnrollmentId,
      );
    if (existing) {
      throw new ConflictException('이미 해당 학생의 과제 결과가 존재합니다.');
    }

    // 6. 생성
    try {
      return await this.assignmentResultsRepo.create({
        assignmentId,
        lectureEnrollmentId,
        resultIndex: data.resultIndex,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 해당 학생의 과제 결과가 존재합니다.');
      }
      throw error;
    }
  }

  /** 과제 결과 조회 */
  async getResult(instructorId: string, resultId: string) {
    const result = await this.assignmentResultsRepo.findById(resultId);

    if (!result) {
      throw new NotFoundException('과제 결과를 찾을 수 없습니다.');
    }

    // 권한 확인
    if (result.assignment.instructorId !== instructorId) {
      throw new ForbiddenException('해당 과제 결과에 대한 권한이 없습니다.');
    }

    return result;
  }

  /** 과제 결과 수정 */
  async updateResult(
    instructorId: string,
    resultId: string,
    data: { resultIndex: number },
  ) {
    // 1. 기존 결과 조회 및 권한 확인
    const result = await this.getResult(instructorId, resultId);

    // 2. resultIndex 유효성 검증
    const categoryPresetsLength =
      result.assignment.category.resultPresets.length;
    if (data.resultIndex >= categoryPresetsLength) {
      throw new BadRequestException(
        `resultIndex는 0부터 ${categoryPresetsLength - 1} 사이여야 합니다.`,
      );
    }

    // 3. 수정
    return this.assignmentResultsRepo.updateById(resultId, data);
  }

  /** 과제 결과 삭제 */
  async deleteResult(instructorId: string, resultId: string) {
    // 1. 기존 결과 조회 및 권한 확인
    await this.getResult(instructorId, resultId);

    // 2. 삭제
    return this.assignmentResultsRepo.deleteById(resultId);
  }
}
