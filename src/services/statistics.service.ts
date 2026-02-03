import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { StatisticsRepository } from '../repos/statistics.repo.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { PermissionService } from './permission.service.js';

export class StatisticsService {
  constructor(
    private readonly statisticsRepo: StatisticsRepository,
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 통계 산출 및 저장 */
  async calculateAndSaveStatistics(
    examId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // 2. 권한 검증 (강사/조교)
    await this.permissionService.validateInstructorAccess(
      exam.instructorId!,
      userType,
      profileId,
    );

    // 3. 통계 산출 준비
    // 3-1. 전체 문항 목록 조회
    const questions = await this.examsRepo.findQuestionsByExamId(examId);
    if (questions.length === 0) {
      return []; // 문항이 없으면 빈 배열 반환
    }

    // 3-2. 분모: 성적 제출자 수 조회
    const totalSubmissions =
      await this.statisticsRepo.countGradesByExamId(examId);

    // 4. 문항별 통계 계산 및 저장 (Transaction)
    await this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const question of questions) {
        // 4-1. 해당 문항에 대한 학생 답안 조회
        const answers =
          await this.statisticsRepo.findStudentAnswersByQuestionId(
            question.id,
            tx,
          );

        // 4-2. 정답률 계산
        // 분모가 0이면 0% 처리
        const correctCount = answers.filter((a) => a.isCorrect).length;
        const correctRate =
          totalSubmissions > 0
            ? Number(((correctCount / totalSubmissions) * 100).toFixed(2))
            : 0;

        // 4-3. 선지별 선택률 계산 (객관식인 경우)
        let choiceRates: Record<string, number> | null = null;
        if (question.type === 'MULTIPLE') {
          choiceRates = {};

          // 각 보기별 선택 횟수 집계
          const choiceCounts: Record<string, number> = {};
          answers.forEach((a) => {
            const choice = a.submittedAnswer; // "1", "2", ...
            choiceCounts[choice] = (choiceCounts[choice] || 0) + 1;
          });

          Object.keys(choiceCounts).forEach((choiceKey) => {
            const count = choiceCounts[choiceKey];
            const rate =
              totalSubmissions > 0
                ? Number(((count / totalSubmissions) * 100).toFixed(2))
                : 0;
            choiceRates![choiceKey] = rate;
          });
        }

        // 4-4. 저장
        const statistic = await this.statisticsRepo.upsertQuestionStatistic(
          examId,
          question.id,
          {
            totalSubmissions,
            correctRate,
            choiceRates: choiceRates ?? Prisma.JsonNull,
          },
          tx,
        );
        results.push(statistic);
      }
    });
    return await this.getStatistics(examId, userType, profileId);
  }

  /** 통계 조회 (확장: 전체 평균, 등수 등 포함) */
  async getStatistics(examId: string, userType: UserType, profileId: string) {
    // 1. Exam 확인 & 권한 검증
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    await this.permissionService.validateInstructorAccess(
      exam.instructorId!,
      userType,
      profileId,
    );

    // 2. 데이터 병렬 조회 (성능 최적화)
    const [summary, questionStats, studentGrades, correctCounts, questions] =
      await Promise.all([
        this.statisticsRepo.getExamSummary(examId),
        this.statisticsRepo.findStatisticsByExamId(examId),
        this.statisticsRepo.getStudentGradesWithInfo(examId),
        this.statisticsRepo.getStudentCorrectCounts(examId),
        this.examsRepo.findQuestionsByExamId(examId),
      ]);

    // 3. 문항 정보 매핑 (번호 추가)
    // Statistic에는 questionNumber가 없으므로 Question 엔티티와 조인하거나 매핑 필요
    const questionMap = new Map(questions.map((q) => [q.id, q.questionNumber]));
    const mappedQuestionStats = questionStats.map((stat) => ({
      questionId: stat.questionId,
      questionNumber: questionMap.get(stat.questionId),
      totalSubmissions: stat.totalSubmissions,
      correctRate: stat.correctRate,
      choiceRates: stat.choiceRates as Record<string, number> | null,
    }));

    // 4. 학생 성적 매핑 및 석차 계산
    const totalExaminees = summary.totalExaminees;
    let currentRank = 1;
    const studentStats = [];

    // studentGrades는 이미 score desc 정렬되어 있음
    for (let i = 0; i < studentGrades.length; i++) {
      const grade = studentGrades[i];
      const prevGrade = i > 0 ? studentGrades[i - 1] : null;

      // 동점자 처리: 이전 점수와 다르면 현재 인덱스+1이 새로운 등수
      if (prevGrade && prevGrade.score !== grade.score) {
        currentRank = i + 1;
      }

      studentStats.push({
        lectureEnrollmentId: grade.lectureEnrollmentId,
        enrollmentId: grade.lectureEnrollment.enrollment.id,
        studentName: grade.lectureEnrollment.enrollment.studentName,
        school: grade.lectureEnrollment.enrollment.school,
        correctCount: correctCounts[grade.lectureEnrollmentId] ?? 0,
        score: grade.score,
        rank: currentRank,
        totalRank: totalExaminees, // 분모 (예: 5/20등)
      });
    }

    return {
      examStats: summary,
      questionStats: mappedQuestionStats,
      studentStats,
    };
  }
}
