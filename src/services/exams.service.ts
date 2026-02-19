import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { GradingStatus } from '../constants/exams.constant.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { PermissionService } from './permission.service.js';
import type {
  CreateExamDto,
  UpdateExamDto,
  UpdateExamReportAssignmentsDto,
} from '../validations/exams.validation.js';

export class ExamsService {
  constructor(
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 강사별 전체 시험 목록 조회 */
  async getExamsByInstructor(userType: UserType, profileId: string) {
    const effectiveInstructorId =
      await this.permissionService.getEffectiveInstructorId(
        userType,
        profileId,
      );

    const exams = await this.examsRepo.findByInstructorId(
      effectiveInstructorId,
    );
    return exams.map(({ lecture, _count, ...exam }) => ({
      ...exam,
      lectureTitle: lecture.title,
      hasClinic:
        exam.gradingStatus === GradingStatus.COMPLETED &&
        (_count?.clinics ?? 0) > 0,
    }));
  }

  /** 강의별 시험 목록 조회 (questions 제외) */
  async getExamsByLectureId(
    lectureId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 확인
    const lecture = await this.lecturesRepo.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 확인
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 3. 시험 목록 조회
    const exams = await this.examsRepo.findByLectureId(lectureId);
    return exams.map(({ lecture, _count, ...exam }) => ({
      ...exam,
      lectureTitle: lecture.title,
      hasClinic:
        exam.gradingStatus === GradingStatus.COMPLETED &&
        (_count?.clinics ?? 0) > 0,
    }));
  }

  /** 시험 상세 조회 (questions 및 수강생 정보 포함) */
  async getExamById(examId: string, userType: UserType, profileId: string) {
    // 1. Exam 조회
    const exam = await this.examsRepo.findByIdWithEnrollments(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 확인
    await this.permissionService.validateInstructorAccess(
      exam.instructorId,
      userType,
      profileId,
    );

    return exam;
  }

  /** 시험 및 문항 생성 (Transaction) */
  async createExam(
    lectureId: string,
    data: CreateExamDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 확인
    const lecture = await this.lecturesRepo.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 확인 (강사/조교)
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 3. 트랜잭션으로 Exam + Questions 생성
    // InstructorId는 강의의 담당 강사로 설정 (조교가 생성해도 소유는 강사)
    return await this.prisma.$transaction(async (tx) => {
      return await this.examsRepo.createWithQuestions(
        lectureId,
        lecture.instructorId,
        data,
        tx,
      );
    });
  }

  /** 시험 수정 및 문항 Upsert (Transaction) */
  async updateExam(
    examId: string,
    data: UpdateExamDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 확인
    await this.permissionService.validateInstructorAccess(
      exam.instructorId,
      userType,
      profileId,
    );

    // 3. 트랜잭션 처리
    return await this.prisma.$transaction(async (tx) => {
      // 3-1. Exam 기본 정보 수정
      const _updatedExam = await this.examsRepo.update(examId, data, tx);

      // 3-2. 문항 Upsert 로직 처리
      if (data.questions) {
        const inputQuestions = data.questions;

        // 기존 문항 조회
        const existingQuestions = await this.examsRepo.findQuestionsByExamId(
          examId,
          tx,
        );
        const existingQuestionMap = new Map(
          existingQuestions.map((q) => [q.questionNumber, q]),
        );

        const inputQuestionNumbers = inputQuestions.map(
          (q) => q.questionNumber,
        );

        // A. Delete: 전달되지 않은 기존 문항 번호 삭제
        const toDeleteIds = existingQuestions
          .filter((q) => !inputQuestionNumbers.includes(q.questionNumber))
          .map((q) => q.id);

        if (toDeleteIds.length > 0) {
          await this.examsRepo.deleteQuestions(toDeleteIds, tx);
        }

        // B. Upsert Loop
        for (const inputQ of inputQuestions) {
          const existingQ = existingQuestionMap.get(inputQ.questionNumber);

          if (existingQ) {
            // Update using existing Question ID
            await this.examsRepo.updateQuestion(existingQ.id, inputQ, tx);
          } else {
            // Create
            await this.examsRepo.createQuestion(
              examId,
              exam.lectureId,
              inputQ,
              tx,
            );
          }
        }
      }

      // 3-3. 최종 결과 반환 (수정된 문항 포함)
      return await this.examsRepo.findByIdWithQuestions(examId, tx);
    });
  }

  /** 시험 삭제 (PENDING 상태일 때만 가능) */
  async deleteExam(examId: string, userType: UserType, profileId: string) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    await this.permissionService.validateInstructorAccess(
      exam.instructorId,
      userType,
      profileId,
    );

    // 3. 상태 확인 (PENDING 이외는 삭제 불가)
    if (exam.gradingStatus !== GradingStatus.PENDING) {
      throw new BadRequestException(
        '채점이 시작된 시험은 삭제할 수 없습니다. (Pending 상태만 가능)',
      );
    }

    // 4. 삭제 처리
    await this.examsRepo.delete(examId);
  }

  /** 시험 성적표 과제 목록 업데이트 */
  async updateExamReportAssignments(
    examId: string,
    data: UpdateExamReportAssignmentsDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 확인
    await this.permissionService.validateInstructorAccess(
      exam.instructorId,
      userType,
      profileId,
    );

    // 3. 과제 존재 여부 확인
    if (data.assignments && data.assignments.length > 0) {
      const count = await this.prisma.assignment.count({
        where: {
          id: { in: data.assignments },
        },
      });

      if (count !== data.assignments.length) {
        throw new BadRequestException(
          '존재하지 않는 과제가 포함되어 있습니다.',
        );
      }
    }

    // 4. 트랜잭션 처리
    return await this.prisma.$transaction(async (tx) => {
      const inputAssignmentIds = data.assignments;

      // 3-1. 기존 과제 연계 조회
      const existingAssignments =
        await this.examsRepo.findAssignmentsOnExamReportByExamId(examId, tx);

      // 3-2. Delete: 전달되지 않은 기존 과제 연계 삭제
      const toDeleteIds = existingAssignments
        .filter((a) => !inputAssignmentIds.includes(a.assignmentId))
        .map((a) => a.id);

      if (toDeleteIds.length > 0) {
        await this.examsRepo.deleteAssignmentsOnExamReport(toDeleteIds, tx);
      }

      // 3-3. Upsert: 전달된 모든 과제 연계 생성 또는 수정
      for (const assignmentId of inputAssignmentIds) {
        await this.examsRepo.upsertAssignmentOnExamReport(
          examId,
          assignmentId,
          tx,
        );
      }

      // 3-4. 최종 결과 반환
      return await this.examsRepo.findAssignmentsOnExamReportByExamId(
        examId,
        tx,
      );
    });
  }
}
