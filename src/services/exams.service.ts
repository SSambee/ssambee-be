import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { PermissionService } from './permission.service.js';
import type {
  CreateExamDto,
  UpdateExamDto,
} from '../validations/exams.validation.js';

export class ExamsService {
  constructor(
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

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
    return await this.examsRepo.findByLectureId(lectureId);
  }

  /** 시험 상세 조회 (questions 및 수강생 정보 포함) */
  async getExamById(examId: string, userType: UserType, profileId: string) {
    // 1. Exam 조회
    const exam = await this.examsRepo.findByIdWithEnrollments(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 확인 (강의 담당자 체크)
    const lecture = await this.lecturesRepo.findById(exam.lectureId);
    if (!lecture) {
      throw new NotFoundException('관련 강의를 찾을 수 없습니다.');
    }

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
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

    // 2. 권한 확인 (강사/조교가 해당 강의에 접근 권한이 있는지)
    // Exam에는 instructorId가 있지만 nullable일 수 있으므로 lecture를 통해 확인 권장
    // (스키마상 Exam.instructorId는 nullable이지만 Create 시점엔 넣음)
    // 가장 확실한건 Lecture의 instructorId 확인
    const lecture = await this.lecturesRepo.findById(exam.lectureId);
    if (!lecture) {
      // 데이터 무결성 문제지만 예외 처리
      throw new NotFoundException('관련 강의를 찾을 수 없습니다.');
    }

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
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
        const existingIds = existingQuestions.map((q) => q.id);

        const inputIds = inputQuestions
          .map((q) => q.id)
          .filter((id): id is string => !!id);

        // A. Delete: 전달되지 않은 기존 ID 삭제
        const toDeleteIds = existingIds.filter((id) => !inputIds.includes(id));
        if (toDeleteIds.length > 0) {
          await this.examsRepo.deleteQuestions(toDeleteIds, tx);
        }

        // B. Upsert Loop
        for (const inputQ of inputQuestions) {
          if (inputQ.id && existingIds.includes(inputQ.id)) {
            // Update
            await this.examsRepo.updateQuestion(inputQ.id, inputQ, tx);
          } else {
            // Create (id가 없거나, 있어도 DB에 없는 경우 - DB에 없는데 ID 보내면 에러나거나 무시? -> 여기선 Create로 취급하되 ID는 새로 따짐)
            // 보통 ID가 있으면 Update 시도하므로, ID가 있는데 DB에 없으면 에러가 낫겠지만,
            // 여기 로직상 inputQ.id && existingIds.includes 체크하므로
            // ID가 있어도 매칭 안되면 Create로 넘어옴 (ID 무시하고 새로 생성됨)
            // -> 기획 의도: id 없음 = Create.
            await this.examsRepo.createQuestion(examId, lecture.id, inputQ, tx);
          }
        }
      }

      // 3-3. 최종 결과 반환 (수정된 문항 포함)
      return await this.examsRepo.findByIdWithQuestions(examId, tx);
    });
  }
}
