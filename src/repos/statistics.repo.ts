import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { QuestionStatistic } from '../generated/prisma/client.js';

export class StatisticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 문항별 통계 데이터 Upsert (Transaction 지원) */
  async upsertQuestionStatistic(
    examId: string,
    questionId: string,
    data: {
      totalSubmissions: number;
      correctRate: number;
      choiceRates: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<QuestionStatistic> {
    const client = tx ?? this.prisma;

    return await client.questionStatistic.upsert({
      where: {
        questionId,
      },
      create: {
        examId,
        questionId,
        totalSubmissions: data.totalSubmissions,
        correctRate: data.correctRate,
        choiceRates: data.choiceRates,
      },
      update: {
        examId, // 혹시 모르니 업데이트
        totalSubmissions: data.totalSubmissions,
        correctRate: data.correctRate,
        choiceRates: data.choiceRates,
      },
    });
  }

  /** 시험의 모든 문항 통계 조회 */
  async findStatisticsByExamId(
    examId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<QuestionStatistic[]> {
    const client = tx ?? this.prisma;
    return await client.questionStatistic.findMany({
      where: { examId },
      orderBy: { questionId: 'asc' }, // 문항 생성 순서가 ID 정렬과 일치한다고 가정 (혹은 questionNumber 조인 필요할 수도 있음)
    });
  }

  /**
   * [Raw Data] 시험 ID로 성적 제출자 수 조회 (통계 분모)
   * Grade 테이블에 레코드가 있는 경우만 카운트
   */
  async countGradesByExamId(
    examId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return await client.grade.count({
      where: { examId },
    });
  }

  /**
   * [Raw Data] 문항별 학생 답안 목록 조회 (통계 산출용)
   */
  async findStudentAnswersByQuestionId(
    questionId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.studentAnswer.findMany({
      where: { questionId },
      select: {
        submittedAnswer: true,
        isCorrect: true,
      },
    });
  }

  /** [Extended] 시험 요약 정보 조회 (평균, 최고, 최저) */
  async getExamSummary(examId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    // 1. 성적 집계
    const aggregations = await client.grade.aggregate({
      where: { examId },
      _avg: { score: true },
      _max: { score: true },
      _min: { score: true },
      _count: { _all: true },
    });

    // 2. 시험 날짜 조회 (Schedule 연동)
    const exam = await client.exam.findUnique({
      where: { id: examId },
      select: {
        examDate: true,
      },
    });

    return {
      averageScore: aggregations._avg.score ?? 0,
      highestScore: aggregations._max.score ?? 0,
      lowestScore: aggregations._min.score ?? 0,
      totalExaminees: aggregations._count._all,
      examDate: exam?.examDate ?? null,
    };
  }

  /** [Extended] 수강생별 정답 개수 조회 (LectureEnrollment ID 기준) */
  async getStudentCorrectCounts(
    examId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Record<string, number>> {
    const client = tx ?? this.prisma;

    // 해당 시험의 모든 문항에 대한 정답(isCorrect=true) 개수를 학생별(lectureEnrollmentId)로 집계
    // Prisma의 groupBy 사용
    const grouped = await client.studentAnswer.groupBy({
      by: ['lectureEnrollmentId'],
      where: {
        question: {
          is: { examId },
        },
        isCorrect: true,
      },
      _count: {
        _all: true,
      },
    });

    // Map 형태로 변환 { lectureEnrollmentId: count }
    const result: Record<string, number> = {};
    grouped.forEach((g) => {
      result[g.lectureEnrollmentId] = g._count._all;
    });

    return result;
  }

  /** [Extended] 수강생 성적 및 정보 목록 조회 (점수 내림차순) */
  async getStudentGradesWithInfo(
    examId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.findMany({
      where: { examId },
      include: {
        lectureEnrollment: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentName: true,
                school: true,
              },
            },
          },
        },
      },
      orderBy: { score: 'desc' }, // 석차 계산을 위해 정렬
    });
  }

  /** [Extended] 성적 등수 업데이트 */
  async updateGradeRank(
    gradeId: string,
    rank: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.update({
      where: { id: gradeId },
      data: { rank },
    });
  }
}
