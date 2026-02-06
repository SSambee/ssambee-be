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
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { AttendancesRepository } from '../repos/attendances.repo.js';
import { PermissionService } from './permission.service.js';
import type { SubmitGradingDto } from '../validations/grades.validation.js';

export class GradesService {
  constructor(
    private readonly gradesRepo: GradesRepository,
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly lectureEnrollmentsRepo: LectureEnrollmentsRepository,
    private readonly attendancesRepo: AttendancesRepository,
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
    const { lectureEnrollmentId, answers, totalScore, correctCount } = data;

    // 1. Exam 확인 (LectureId 확보)
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // if (exam.gradingStatus === GradingStatus.COMPLETED) {
    //   throw new BadRequestException('이미 채점이 완료된 시험입니다.');
    // }

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

    // 2-1. LectureEnrollment 검증
    const lectureEnrollment =
      await this.lectureEnrollmentsRepo.findByIdWithDetails(
        lectureEnrollmentId,
      );
    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    if (lectureEnrollment.lectureId !== exam.lectureId) {
      throw new BadRequestException(
        '해당 시험이 속한 강의의 수강생이 아닙니다.',
      );
    }

    // 3. 보안 채점 로직
    const questions = await this.examsRepo.findQuestionsByExamId(examId);
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const questionNumberMap = new Map(
      questions.map((q) => [q.questionNumber, q]),
    ); // 문항 번호 매핑용

    let calculatedTotalScore = 0;
    let calculatedCorrectCount = 0;
    const seenQuestionIds = new Set<string>();

    for (const answer of answers) {
      // 문항 ID 식별 (questionId 또는 questionNumber 사용)
      let targetQuestionId = answer.questionId;
      if (!targetQuestionId && answer.questionNumber !== undefined) {
        const q = questionNumberMap.get(answer.questionNumber);
        if (q) {
          targetQuestionId = q.id;
        }
      }

      if (!targetQuestionId) {
        throw new BadRequestException('유효하지 않은 문항 정보입니다.');
      }

      const question = questionMap.get(targetQuestionId);
      if (!question) {
        throw new BadRequestException('해당 시험에 존재하지 않는 문항입니다.');
      }

      // 중복 답안 체크 (questionId 기준)
      if (seenQuestionIds.has(targetQuestionId)) {
        throw new BadRequestException(
          `문항 ${question.questionNumber}번의 답안이 중복 제출되었습니다.`,
        );
      }
      seenQuestionIds.add(targetQuestionId);

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

      // if (currentExam.gradingStatus === GradingStatus.COMPLETED) {
      //   throw new BadRequestException('이미 채점이 완료된 시험입니다.');
      // }

      if (currentExam.gradingStatus === GradingStatus.PENDING) {
        await this.examsRepo.updateGradingStatus(
          examId,
          GradingStatus.IN_PROGRESS,
          tx,
        );
      }

      // 5-1. 답안 Upsert
      // DTO에는 questionId가 없을 수 있으므로, 매핑된 ID를 포함한 객체로 변환
      const answersToSave = answers.map((a) => {
        let qId = a.questionId;
        if (!qId && a.questionNumber !== undefined) {
          const q = questionNumberMap.get(a.questionNumber);
          if (q) qId = q.id;
        }

        if (!qId) {
          // 앞선 검증 로직을 통과했다면 발생하지 않아야 함
          throw new BadRequestException('문항 정보를 찾을 수 없습니다.');
        }

        return {
          ...a,
          questionId: qId,
        };
      });

      await this.gradesRepo.upsertStudentAnswers(
        exam.lectureId,
        lectureEnrollment.id, // 찾은 LectureEnrollment의 진짜 ID (le_...)를 사용
        answersToSave,
        tx,
      );

      // 5-2. 성적 Upsert
      return await this.gradesRepo.upsertGrade(
        exam.lectureId,
        examId,
        lectureEnrollmentId,
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

  /** 수강별 성적 목록 조회 (학생/학부모용) - LectureEnrollment ID 기준 */
  async getGradesByLectureEnrollment(
    lectureEnrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. LectureEnrollment 검증 및 권한 확인
    const lectureEnrollment =
      await this.lectureEnrollmentsRepo.findByIdWithDetails(
        lectureEnrollmentId,
      );
    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 2. 본인 또는 자녀 확인 (enrollment 정보로 권한 검증)
    await this.permissionService.validateLectureEnrollmentReadAccess(
      lectureEnrollment,
      userType,
      profileId,
    );

    // 3. 성적 목록 조회
    const grades =
      await this.gradesRepo.findByLectureEnrollmentId(lectureEnrollmentId);

    // 4. 각 성적별 등수 및 평균 계산 (병렬 처리)
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
            grade.lectureEnrollment.lecture.instructor.user.name ??
            '알 수 없음',
          lectureTitle: lectureEnrollment.lecture.title,
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

    // 2. LectureEnrollment 정보로 권한 확인
    const lectureEnrollment =
      await this.lectureEnrollmentsRepo.findByIdWithDetails(
        grade.lectureEnrollmentId,
      );

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    await this.permissionService.validateLectureEnrollmentReadAccess(
      lectureEnrollment,
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
      studentName: grade.lectureEnrollment.enrollment.studentName,
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

  /** (관리자용) 수강생별 시험 답안 상세 조회 */
  async getStudentGradeWithAnswers(
    examId: string,
    lectureEnrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
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

    // 3. 데이터 조회
    const gradeWithDetails =
      await this.gradesRepo.findGradeWithDetailsByExamAndEnrollment(
        examId,
        lectureEnrollmentId,
      );

    if (!gradeWithDetails) {
      // 성적이 아직 등록되지 않았다면, 답안이라도 있는지 확인 필요하거나 예외 처리
      // 현재 로직상 성적이 없으면 조회 불가 처리
      throw new NotFoundException('해당 수강생의 성적 정보가 없습니다.');
    }

    // 4. 데이터 가공
    const { questions } = gradeWithDetails.exam;
    const { studentAnswers } = gradeWithDetails.lectureEnrollment;
    const answerMap = new Map(studentAnswers.map((a) => [a.questionId, a]));

    const questionResults = questions.map((q) => {
      const studentAnswer = answerMap.get(q.id);
      return {
        questionId: q.id,
        questionNumber: q.questionNumber,
        type: q.type,
        score: q.score,
        content: q.content,
        correctAnswer: q.correctAnswer,
        submittedAnswer: studentAnswer?.submittedAnswer ?? null,
        isCorrect: studentAnswer?.isCorrect ?? false,
      };
    });

    return {
      studentName: gradeWithDetails.lectureEnrollment.enrollment.studentName,
      score: gradeWithDetails.score,
      isPass: gradeWithDetails.isPass,
      examTitle: gradeWithDetails.exam.title,
      questions: questionResults,
    };
  }

  /** [NEW] 성적표 리포트 조회 (관리자용) */
  async getGradeReport(
    examId: string,
    lectureEnrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 상세 리포트 데이터 조회
    const gradeData = await this.gradesRepo.findGradeReportByExamAndEnrollment(
      examId,
      lectureEnrollmentId,
    );

    if (!gradeData) {
      throw new NotFoundException('해당 성적 정보를 찾을 수 없습니다.');
    }

    const { exam, lectureEnrollment } = gradeData;
    const { lecture, enrollment, studentAnswers } = lectureEnrollment;

    // 2. 권한 검증 (강사/조교)
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 3. 출석률 계산
    const { totalCount, absentCount } =
      await this.attendancesRepo.getAttendanceStatsByLectureEnrollment(
        lectureEnrollmentId,
      );

    let attendanceRate = 0;
    if (totalCount > 0) {
      attendanceRate = ((totalCount - absentCount) / totalCount) * 100;
    }
    // 소수점 첫째자리 반올림
    attendanceRate = Math.round(attendanceRate * 10) / 10;

    // 4. 데이터 가공

    // 4-1. 문항별 상세 정보
    const answerMap = new Map(studentAnswers.map((a) => [a.questionId, a]));
    const questionsWithStats = exam.questions.map((q) => {
      const studentAnswer = answerMap.get(q.id);
      const isCorrect = studentAnswer?.isCorrect ?? false;
      // 정답률이 있으면 오답률 = 100 - 정답률
      const correctRate = q.statistic?.correctRate ?? 0;
      const wrongRate = parseFloat((100 - correctRate).toFixed(1));

      return {
        questionNumber: q.questionNumber,
        content: q.content,
        source: q.source,
        category: q.category,
        isCorrect,
        wrongRate,
      };
    });

    // 4-2. 최근 시험 이력 (6개)
    const recentGrades = lectureEnrollment.grades.map((g) => ({
      gradeId: g.id,
      examDate: g.exam.examDate ?? g.exam.createdAt,
      title: g.exam.title,
      score: g.score,
    }));

    return {
      instructor: {
        name: lecture.instructor.user.name,
        academy: lecture.instructor.academy,
        subject: lecture.instructor.subject,
      },
      enrollment: {
        name: enrollment.studentName,
      },
      exam: {
        title: exam.title,
        examDate: exam.examDate,
        description: exam.description,
        category: exam.category,
        gradesCount: exam.gradesCount,
        averageScore: exam.averageScore || 0,
      },
      grade: {
        score: gradeData.score,
        rank: gradeData.rank || 0,
        isPass: gradeData.isPass,
      },
      lecture: {
        title: lecture.title,
      },
      recentGrades,
      attendanceRate,
      questions: questionsWithStats,
    };
  }
}
