import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type { Exam, Question } from '../generated/prisma/client.js';
import type {
  CreateExamDto,
  UpdateExamDto,
  QuestionUpsertDto,
} from '../validations/exams.validation.js';

export type ExamWithQuestions = Exam & { questions: Question[] };

export type EnrollmentGradeInfo = {
  lectureEnrollmentId: string;
  studentName: string;
  appStudentId: string | null; // 추가: 학생 상세 이동 위해
  schoolYear: string;
  hasGrade: boolean;
  score?: number; // 선택적: 점수도 보여줄 수 있음
};

export type ExamDetailWithEnrollments = Exam & {
  questions: Question[];
  lecture: { title: string };
  enrollments: EnrollmentGradeInfo[];
};

export class ExamsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Exam 생성 (questions 포함) */
  async createWithQuestions(
    lectureId: string,
    instructorId: string,
    data: CreateExamDto,
    tx?: Prisma.TransactionClient,
  ): Promise<ExamWithQuestions> {
    const client = tx ?? this.prisma;

    // Prisma의 create는 nested create를 지원하므로 한 번에 생성 가능
    return await client.exam.create({
      data: {
        lectureId,
        instructorId,
        title: data.title,
        cutoffScore: data.cutoffScore,
        source: data.source,
        examDate: data.examDate,
        category: data.category,
        isAutoClinic: data.isAutoClinic,
        questions: {
          create: data.questions.map((q) => ({
            questionNumber: q.questionNumber,
            content: q.content,
            type: q.type,
            score: q.score,
            choices: q.choices ?? Prisma.JsonNull,
            correctAnswer: q.correctAnswer,
            source: q.source,
            category: q.category,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { questionNumber: 'asc' },
        },
      },
    });
  }

  /** 강의별 시험 목록 조회 (questions 제외 - 성능 최적화) */
  async findByLectureId(lectureId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.exam.findMany({
      where: { lectureId },
      include: {
        lecture: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  /** 강사별 전체 시험 목록 조회 (강의 정보 포함) */
  async findByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.exam.findMany({
      where: { instructorId },
      include: {
        lecture: {
          select: {
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Exam 조회 (ID) */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Exam | null> {
    const client = tx ?? this.prisma;
    return await client.exam.findUnique({
      where: { id },
    });
  }

  /** Exam 조회 (ID) - Questions 포함 */
  async findByIdWithQuestions(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ExamWithQuestions | null> {
    const client = tx ?? this.prisma;
    return await client.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { questionNumber: 'asc' },
        },
      },
    });
  }

  /** Exam 조회 (ID) - 수강생 및 성적 정보 포함 */
  async findByIdWithEnrollments(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ExamDetailWithEnrollments | null> {
    const client = tx ?? this.prisma;
    const exam = await client.exam.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { questionNumber: 'asc' },
        },
        lecture: {
          select: {
            title: true,
            lectureEnrollments: {
              where: {
                enrollment: {
                  // 삭제된 수강생 제외 (혹은 status 체크) - 일단 삭제되지 않은 것만
                  deletedAt: null,
                },
              },
              include: {
                enrollment: {
                  select: {
                    studentName: true,
                    schoolYear: true,
                    appStudentId: true,
                  },
                },
                grades: {
                  where: { examId: id },
                  select: { id: true, score: true },
                  take: 1,
                },
              },
              orderBy: {
                enrollment: { studentName: 'asc' },
              },
            },
          },
        },
      },
    });

    if (!exam) return null;

    // 데이터 매핑
    const enrollments: EnrollmentGradeInfo[] =
      exam.lecture.lectureEnrollments.map((le) => ({
        lectureEnrollmentId: le.id,
        studentName: le.enrollment.studentName,
        schoolYear: le.enrollment.schoolYear,
        appStudentId: le.enrollment.appStudentId,
        hasGrade: le.grades.length > 0,
        score: le.grades[0]?.score,
      }));

    return {
      ...exam,
      lecture: { title: exam.lecture.title }, // lecture 객체 축소
      enrollments,
    };
  }

  /** Exam 기본 정보 수정 */
  async update(
    id: string,
    data: UpdateExamDto,
    tx?: Prisma.TransactionClient,
  ): Promise<Exam> {
    const client = tx ?? this.prisma;
    // questions 필드는 exclude하고 업데이트 (Prisma 타입 이슈 방지)
    const { questions: _questions, ...updateData } = data;

    return await client.exam.update({
      where: { id },
      data: updateData,
    });
  }

  /** 채점 상태 변경 */
  async updateGradingStatus(
    id: string,
    gradingStatus: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Exam> {
    const client = tx ?? this.prisma;
    return await client.exam.update({
      where: { id },
      data: { gradingStatus },
    });
  }

  // --- Question CRUD methods ---

  /** 문항 생성 */
  async createQuestion(
    examId: string,
    lectureId: string,
    data: QuestionUpsertDto,
    tx?: Prisma.TransactionClient,
  ): Promise<Question> {
    const client = tx ?? this.prisma;
    return await client.question.create({
      data: {
        examId,
        lectureId,
        questionNumber: data.questionNumber,
        content: data.content,
        type: data.type,
        score: data.score,
        choices: data.choices ?? Prisma.JsonNull,
        correctAnswer: data.correctAnswer,
        source: data.source,
        category: data.category,
      },
    });
  }

  /** 문항 수정 */
  async updateQuestion(
    id: string,
    data: QuestionUpsertDto,
    tx?: Prisma.TransactionClient,
  ): Promise<Question> {
    const client = tx ?? this.prisma;
    return await client.question.update({
      where: { id },
      data: {
        questionNumber: data.questionNumber,
        content: data.content,
        type: data.type,
        score: data.score,
        choices: data.choices ?? Prisma.JsonNull,
        correctAnswer: data.correctAnswer,
        source: data.source,
        category: data.category,
      },
    });
  }

  /** 문항 삭제 (여러 개) */
  async deleteQuestions(
    ids: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    // prisma deleteMany
    await client.question.deleteMany({
      where: { id: { in: ids } },
    });
  }

  /** 특정 시험의 모든 문항 조회 */
  async findQuestionsByExamId(
    examId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Question[]> {
    const client = tx ?? this.prisma;
    return await client.question.findMany({
      where: { examId },
      orderBy: { questionNumber: 'asc' },
    });
  }

  /** 시험 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.exam.delete({
      where: { id },
    });
  }
}
