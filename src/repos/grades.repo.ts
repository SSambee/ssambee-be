import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class GradesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 학생 답안 일괄 Upsert (Transaction 내에서 호출 권장) */
  async upsertStudentAnswers(
    lectureId: string,
    lectureEnrollmentId: string,
    answers: {
      questionId: string;
      submittedAnswer: string;
      isCorrect: boolean;
    }[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    // 반복문으로 Upsert 수행
    // 성능 최적화를 위해 Promise.all 사용
    const promises = answers.map((answer) => {
      // isCorrect 여부에 관계없이 모두 저장
      return client.studentAnswer.upsert({
        where: {
          lectureEnrollmentId_questionId: {
            lectureEnrollmentId,
            questionId: answer.questionId,
          },
        },
        create: {
          lectureId,
          lectureEnrollmentId,
          questionId: answer.questionId,
          submittedAnswer: answer.submittedAnswer,
          isCorrect: answer.isCorrect,
        },
        update: {
          submittedAnswer: answer.submittedAnswer,
          isCorrect: answer.isCorrect,
        },
      });
    });

    await Promise.all(promises);
  }

  /** 성적 Upsert */
  async upsertGrade(
    lectureId: string,
    examId: string,
    lectureEnrollmentId: string,
    score: number,
    isPass: boolean,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.upsert({
      where: {
        examId_lectureEnrollmentId: {
          examId,
          lectureEnrollmentId,
        },
      },
      create: {
        lectureId,
        examId,
        lectureEnrollmentId,
        score,
        isPass,
      },
      update: {
        score,
        isPass,
      },
    });
  }

  /** 시험별 성적 목록 조회 (LectureEnrollment → Enrollment 정보 포함) */
  async findGradesByExamId(examId: string, tx?: Prisma.TransactionClient) {
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
                studentPhone: true,
                parentPhone: true,
                school: true,
                schoolYear: true,
              },
            },
          },
        },
      },
      orderBy: { score: 'desc' }, // 점수 내림차순 정렬
    });
  }

  /** 수강생별 성적 목록 조회 (LectureEnrollment ID 기준) */
  async findByLectureEnrollmentId(
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.findMany({
      where: { lectureEnrollmentId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            examDate: true,
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: true,
            lecture: {
              include: {
                instructor: {
                  select: {
                    user: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 성적 상세 조회 (문항 통계 포함) */
  async findByIdWithDetails(gradeId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.grade.findUnique({
      where: { id: gradeId },
      include: {
        exam: {
          include: {
            questions: {
              include: {
                statistic: true,
              },
              orderBy: { questionNumber: 'asc' },
            },
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentName: true,
                appStudentId: true,
                appParentLinkId: true,
              },
            },
          },
        },
      },
    });
  }

  /** 특정 시험/수강생의 성적 및 답안 조회 */
  async findGradeWithDetailsByExamAndEnrollment(
    examId: string,
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.findUnique({
      where: {
        examId_lectureEnrollmentId: {
          examId,
          lectureEnrollmentId,
        },
      },
      include: {
        exam: {
          include: {
            questions: {
              orderBy: { questionNumber: 'asc' },
            },
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentName: true,
                studentPhone: true,
                school: true,
                schoolYear: true,
              },
            },
            studentAnswers: {
              where: {
                question: {
                  examId: examId,
                },
              },
            },
          },
        },
      },
    });
  }

  /** 특정 시험에서의 등수 계산 */
  async calculateRankByExamId(
    examId: string,
    score: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    // 나보다 점수가 높은 사람 수 + 1 = 등수
    const betterCount = await client.grade.count({
      where: {
        examId,
        score: { gt: score },
      },
    });
    return betterCount + 1;
  }

  /** 특정 시험의 평균 점수 계산 */
  async calculateAverageByExamId(
    examId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const aggregate = await client.grade.aggregate({
      where: { examId },
      _avg: {
        score: true,
      },
    });
    return aggregate._avg.score || 0;
  }

  /** [NEW] 성적표 리포트용 데이터 조회 */
  async findGradeReportByExamAndEnrollment(
    examId: string,
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    return await client.grade.findUnique({
      where: {
        examId_lectureEnrollmentId: {
          examId,
          lectureEnrollmentId,
        },
      },
      include: {
        exam: {
          include: {
            questions: {
              include: {
                statistic: true,
              },
              orderBy: { questionNumber: 'asc' },
            },
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: true,
            lecture: {
              include: {
                instructor: {
                  select: {
                    user: { select: { name: true } },
                    academy: true,
                    subject: true,
                  },
                },
              },
            },
            studentAnswers: {
              where: {
                question: { examId },
              },
            },
            grades: {
              include: {
                exam: {
                  select: {
                    id: true,
                    title: true,
                    examDate: true,
                    createdAt: true,
                  },
                },
              },
              orderBy: {
                exam: { createdAt: 'desc' },
              },
              take: 6,
            },
          },
        },
      },
    });
  }
}
