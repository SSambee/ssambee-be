import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { GradesRepository } from '../repos/grades.repo.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { PermissionService } from './permission.service.js';
import type { SubmitGradingDto } from '../validations/grades.validation.js';

export class GradesService {
  constructor(
    private readonly gradesRepo: GradesRepository,
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly enrollmentsRepo: EnrollmentsRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 학생 답안 채점 및 제출 */
  async submitGrading(
    examId: string,
    data: SubmitGradingDto,
    userType: UserType,
    profileId: string,
  ) {
    const { enrollmentId, answers, totalScore, correctCount } = data;

    // 1. Exam 확인 (LectureId 확보)
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    if (exam.gradingStatus === GradingStatus.COMPLETED) {
      throw new BadRequestException('이미 채점이 완료된 시험입니다.');
    }

    // 2. 권한 검증 (강사/조교)
    const lecture = await this.lecturesRepo.findById(exam.lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 2-1. Enrollment 검증
    const enrollment = await this.enrollmentsRepo.findById(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    if (enrollment.lectureId !== exam.lectureId) {
      throw new BadRequestException(
        '해당 시험이 속한 강의의 수강생이 아닙니다.',
      );
    }

    // 3. 보안 채점 로직
    const questions = await this.examsRepo.findQuestionsByExamId(examId);
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    let calculatedTotalScore = 0;
    let calculatedCorrectCount = 0;
    const seenQuestionIds = new Set<string>();

    for (const answer of answers) {
      if (seenQuestionIds.has(answer.questionId)) {
        throw new BadRequestException(
          `중복된 문항 ID가 제출되었습니다: ${answer.questionId}`,
        );
      }
      seenQuestionIds.add(answer.questionId);

      const question = questionMap.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(
          `문항 ID ${answer.questionId}가 유효하지 않습니다.`,
        );
      }

      // 정답 비교 로직
      let isActuallyCorrect = false;

      // [Rule] 서술형(ESSAY)은 서버에서 자동 채점하지 않고 채점관(Client)의 판정을 신뢰
      if (question.type === 'ESSAY') {
        isActuallyCorrect = answer.isCorrect;
      } else {
        // 객관식은 서버 정답과 비교
        isActuallyCorrect = question.correctAnswer === answer.submittedAnswer;

        // 클라이언트 검증 (객관식만 수행)
        if (answer.isCorrect !== isActuallyCorrect) {
          throw new BadRequestException(
            `문항 ${question.questionNumber}번의 채점 결과가 올바르지 않습니다.`,
          );
        }
      }

      if (isActuallyCorrect) {
        calculatedTotalScore += question.score;
        calculatedCorrectCount++;
      }
    }

    // 총점 및 개수 검증
    if (calculatedTotalScore !== totalScore) {
      throw new BadRequestException(
        `총점이 올바르지 않습니다. (Server: ${calculatedTotalScore}, Client: ${totalScore})`,
      );
    }
    if (calculatedCorrectCount !== correctCount) {
      throw new BadRequestException(
        `정답 개수가 올바르지 않습니다. (Server: ${calculatedCorrectCount}, Client: ${correctCount})`,
      );
    }

    // 4. Pass 여부 판단
    const isPass = calculatedTotalScore >= exam.cutoffScore;

    // 5. DB Upsert (Transaction)
    return await this.prisma.$transaction(async (tx) => {
      // 5-0. 시험 상태 재확인 (동시성 제어)
      const currentExam = await this.examsRepo.findById(examId, tx);
      if (!currentExam) {
        throw new NotFoundException('시험을 찾을 수 없습니다.');
      }

      if (currentExam.gradingStatus === GradingStatus.COMPLETED) {
        throw new BadRequestException('이미 채점이 완료된 시험입니다.');
      }

      if (currentExam.gradingStatus === GradingStatus.PENDING) {
        await this.examsRepo.updateGradingStatus(
          examId,
          GradingStatus.IN_PROGRESS,
          tx,
        );
      }

      // 5-1. 답안 Upsert
      await this.gradesRepo.upsertStudentAnswers(
        exam.lectureId,
        enrollmentId,
        answers,
        tx,
      );

      // 5-2. 성적 Upsert
      return await this.gradesRepo.upsertGrade(
        exam.lectureId,
        examId,
        enrollmentId,
        calculatedTotalScore,
        isPass,
        tx,
      );
    });
  }

  /** 시험 성적 목록 조회 */
  async getGradesByExam(examId: string, userType: UserType, profileId: string) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 검증
    const lecture = await this.lecturesRepo.findById(exam.lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 3. 성적 조회
    return await this.gradesRepo.findGradesByExamId(examId);
  }

  /** 수강별 성적 목록 조회 (학생/학부모용) */
  async getGradesByEnrollment(
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Enrollment 검증 및 권한 확인
    const enrollment =
      await this.enrollmentsRepo.findByIdWithRelations(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 본인 또는 자녀 확인
    await this.permissionService.validateEnrollmentReadAccess(
      enrollment,
      userType,
      profileId,
    );

    // 2. 성적 목록 조회
    const grades = await this.gradesRepo.findByEnrollmentId(enrollmentId);

    // 3. 각 성적별 등수 및 평균 계산 (병렬 처리)
    const gradesWithStats = await Promise.all(
      grades.map(async (grade) => {
        const [rank, average] = await Promise.all([
          this.gradesRepo.calculateRankByExamId(grade.examId, grade.score),
          this.gradesRepo.calculateAverageByExamId(grade.examId),
        ]);

        return {
          id: grade.id,
          examTitle: grade.exam.title,
          instructorName:
            grade.enrollment.lecture.instructor.user.name ?? '알 수 없음',
          lectureTitle: enrollment.lecture.title,
          date: grade.exam.schedule?.startTime ?? grade.createdAt,
          score: grade.score,
          isPass: grade.isPass,
          rank,
          average: Math.round(average * 10) / 10, // 소수점 첫째자리 반올림
        };
      }),
    );

    return gradesWithStats;
  }

  /** 성적 상세 조회 (학생/학부모용) */
  async getGradeDetail(gradeId: string, userType: UserType, profileId: string) {
    // 1. 성적 상세 조회
    const grade = await this.gradesRepo.findByIdWithDetails(gradeId);
    if (!grade) {
      throw new NotFoundException('성적 정보를 찾을 수 없습니다.');
    }

    // 2. Enrollment 정보로 권한 확인
    // findByIdWithDetails에서 enrollment 정보를 가져오지만,
    // 전체 관계 데이터가 필요하므로 validateEnrollmentReadAccess를 위해
    // enrollmentRepo를 통해 다시 조회하거나 permissionService를 보완해야 함.
    // 여기서는 permissionService.validateEnrollmentReadAccess가 Enrollment 객체를 받으므로
    // grade.enrollment에 필요한 필드(appStudentId 등)가 있는지 확인해야 함.
    // findByIdWithDetails에서는 select로 studentName만 가져왔으므로, 관계 검증을 위해 추가 조회가 필요함.
    const enrollment = await this.enrollmentsRepo.findByIdWithRelations(
      grade.enrollmentId,
    );

    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    await this.permissionService.validateEnrollmentReadAccess(
      enrollment,
      userType,
      profileId,
    );

    // 3. 등수 및 평균 계산
    const [rank, average] = await Promise.all([
      this.gradesRepo.calculateRankByExamId(grade.examId, grade.score),
      this.gradesRepo.calculateAverageByExamId(grade.examId),
    ]);

    // 4. 응답 데이터 구성
    return {
      studentName: grade.enrollment.studentName,
      score: grade.score,
      rank,
      average: Math.round(average * 10) / 10,
      examTitle: grade.exam.title,
      questionStatistics: grade.exam.questions.map((q) => ({
        questionNumber: q.questionNumber,
        score: q.score,
        correctRate: q.statistic?.correctRate ?? 0,
        choiceRates: q.statistic?.choiceRates ?? null,
      })),
    };
  }
}
