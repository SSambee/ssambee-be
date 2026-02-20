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
import { UpsertAssignmentResultsDto } from '../validations/assignment-results.validation.js';

type UpsertBulkItemStatus =
  | 'CREATED'
  | 'UPDATED'
  | 'DELETED'
  | 'NOT_FOUND'
  | 'FAILED';

type UpsertBulkItemResult = {
  assignmentId: string;
  lectureEnrollmentId: string;
  status: UpsertBulkItemStatus;
  resultIndex?: number | null;
  assignmentResultId?: string;
  reason?: string;
};

type UpsertBulkSummary = {
  requested: number;
  created: number;
  updated: number;
  deleted: number;
  notFound: number;
  failed: number;
};

type UpsertBulkResponse = {
  summary: UpsertBulkSummary;
  items: UpsertBulkItemResult[];
};

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

  /** 과제 결과 단체 등록/수정/삭제 (resultIndex = null 이면 삭제) */
  async upsertBulkResults(
    instructorId: string,
    data: UpsertAssignmentResultsDto,
  ): Promise<UpsertBulkResponse> {
    const summary: UpsertBulkSummary = {
      requested: data.items.length,
      created: 0,
      updated: 0,
      deleted: 0,
      notFound: 0,
      failed: 0,
    };
    const results: UpsertBulkItemResult[] = [];
    const assignmentCache = new Map<
      string,
      Awaited<ReturnType<AssignmentsRepository['findById']>>
    >();
    const strict = data.options?.strict !== false;

    const processItems = async (tx?: Prisma.TransactionClient) => {
      for (const item of data.items) {
        const isDelete = item.resultIndex === null;

        try {
          const assignment = assignmentCache.get(item.assignmentId);
          const resolvedAssignment =
            assignment ??
            (await this.assignmentsRepo.findById(item.assignmentId, tx));
          if (!resolvedAssignment) {
            throw new NotFoundException('과제를 찾을 수 없습니다.');
          }
          if (!assignmentCache.has(item.assignmentId)) {
            assignmentCache.set(item.assignmentId, resolvedAssignment);
          }

          if (resolvedAssignment.instructorId !== instructorId) {
            throw new ForbiddenException('해당 과제에 대한 권한이 없습니다.');
          }

          const lectureEnrollment = await this.lectureEnrollmentsRepo.findById(
            item.lectureEnrollmentId,
            tx,
          );
          if (!lectureEnrollment) {
            throw new NotFoundException('수강생을 찾을 수 없습니다.');
          }

          if (resolvedAssignment.lectureId !== lectureEnrollment.lectureId) {
            throw new BadRequestException(
              '과제와 수강생이 같은 강의에 속하지 않습니다.',
            );
          }

          if (isDelete) {
            const existing =
              await this.assignmentResultsRepo.findByAssignmentAndEnrollment(
                item.assignmentId,
                item.lectureEnrollmentId,
                tx,
              );

            if (!existing) {
              if (!strict) {
                summary.notFound += 1;
                results.push({
                  assignmentId: item.assignmentId,
                  lectureEnrollmentId: item.lectureEnrollmentId,
                  status: 'NOT_FOUND',
                  resultIndex: null,
                  reason: '과제 결과가 존재하지 않습니다.',
                });
                continue;
              }

              throw new NotFoundException('과제 결과가 존재하지 않습니다.');
            }

            await this.assignmentResultsRepo.deleteById(existing.id, tx);
            summary.deleted += 1;
            results.push({
              assignmentId: item.assignmentId,
              lectureEnrollmentId: item.lectureEnrollmentId,
              status: 'DELETED',
            });
            continue;
          }

          // UPSERT (resultIndex는 숫자)
          if (item.resultIndex === null) {
            throw new BadRequestException(
              'resultIndex가 null이면 삭제로 처리되어야 합니다.',
            );
          }

          const categoryPresetsLength =
            resolvedAssignment.category.resultPresets.length;
          if (item.resultIndex >= categoryPresetsLength) {
            throw new BadRequestException(
              `resultIndex는 0부터 ${categoryPresetsLength - 1} 사이여야 합니다.`,
            );
          }

          const existing =
            await this.assignmentResultsRepo.findByAssignmentAndEnrollment(
              item.assignmentId,
              item.lectureEnrollmentId,
              tx,
            );
          let saved;
          if (existing) {
            saved = await this.assignmentResultsRepo.updateById(
              existing.id,
              { resultIndex: item.resultIndex },
              tx,
            );
            summary.updated += 1;
            results.push({
              assignmentId: item.assignmentId,
              lectureEnrollmentId: item.lectureEnrollmentId,
              status: 'UPDATED',
              resultIndex: item.resultIndex,
              assignmentResultId: saved.id,
            });
            continue;
          }

          saved = await this.assignmentResultsRepo.create(
            {
              assignmentId: item.assignmentId,
              lectureEnrollmentId: item.lectureEnrollmentId,
              resultIndex: item.resultIndex,
            },
            tx,
          );
          summary.created += 1;
          results.push({
            assignmentId: item.assignmentId,
            lectureEnrollmentId: item.lectureEnrollmentId,
            status: 'CREATED',
            resultIndex: item.resultIndex,
            assignmentResultId: saved.id,
          });
        } catch (error) {
          if (strict) {
            throw error;
          }

          summary.failed += 1;
          const reason =
            error instanceof Error
              ? error.message
              : '요청을 처리하지 못했습니다.';
          results.push({
            assignmentId: item.assignmentId,
            lectureEnrollmentId: item.lectureEnrollmentId,
            status: 'FAILED',
            resultIndex: item.resultIndex,
            reason,
          });
        }
      }
    };

    if (strict) {
      await this.prisma.$transaction(async (tx) => {
        await processItems(tx);
      });
    } else {
      await processItems();
    }

    return {
      summary,
      items: results,
    };
  }
}
