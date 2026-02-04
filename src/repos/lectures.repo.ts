import { PrismaClient } from '../generated/prisma/client.js';
import type {
  Lecture,
  LectureTime,
  Exam,
  Prisma,
} from '../generated/prisma/client.js';
import { QueryMode } from '../generated/prisma/internal/prismaNamespace.js';
import { CreateLectureWithInstructorIdDto } from '../validations/lectures.validation.js';

export type LectureWithTimes = Lecture & { lectureTimes: LectureTime[] };

export type LectureListItem = Lecture & {
  instructor: {
    user: {
      name: string;
    };
  };
  lectureTimes: LectureTime[];
  _count: {
    lectureEnrollments: number;
  };
};

export type LectureDetail = LectureListItem & {
  lectureEnrollments: Prisma.LectureEnrollmentGetPayload<{
    include: {
      enrollment: true;
      studentAnswers: {
        select: {
          id: true;
          isCorrect: true;
          question: {
            select: {
              score: true;
            };
          };
        };
      };
    };
  }>[];
  exams: (Exam & {
    _count: {
      questions: number;
    };
  })[];
  _count: {
    lectureEnrollments: number;
  };
};

export class LecturesRepository {
  constructor(private readonly prisma: PrismaClient) {}
  /** 강의 생성 */
  async create(
    data: CreateLectureWithInstructorIdDto,
    tx?: Prisma.TransactionClient,
  ): Promise<LectureWithTimes> {
    const client = tx ?? this.prisma;
    // Lecture 생성
    const lecture = await client.lecture.create({
      data: {
        instructorId: data.instructorId,
        title: data.title,
        subject: data.subject,
        schoolYear: data.schoolYear,
        description: data.description,
        startAt: data.startAt ? new Date(data.startAt) : null,
        endAt: data.endAt ? new Date(data.endAt) : null,
        status: data.status,
      },
    });

    // LectureTime 배열 생성 (day array 말고 문자열로)
    if (data.lectureTimes && data.lectureTimes.length > 0) {
      await client.lectureTime.createMany({
        data: data.lectureTimes.map((time) => ({
          lectureId: lecture.id,
          instructorId: data.instructorId,
          day: time.day,
          startTime: time.startTime,
          endTime: time.endTime,
        })),
      });
    }

    // lectureTimes 포함하여 반환
    const lectureWithTimes = await client.lecture.findUniqueOrThrow({
      where: { id: lecture.id },
      include: { lectureTimes: true },
    });

    return lectureWithTimes;
  }

  /** ID로 강의 조회 */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<LectureDetail | null> {
    const client = tx ?? this.prisma;
    return await client.lecture.findUnique({
      where: { id, deletedAt: null },
      include: {
        lectureTimes: true,
        instructor: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
        lectureEnrollments: {
          include: {
            enrollment: true,
            studentAnswers: {
              select: {
                id: true,
                isCorrect: true,
                question: {
                  select: {
                    score: true,
                  },
                },
              },
            },
          },
        },
        exams: {
          include: {
            _count: {
              select: {
                questions: true,
              },
            },
          },
          orderBy: {
            id: 'desc',
          },
        },
        _count: {
          select: {
            lectureEnrollments: true,
          },
        },
      },
    });
  }

  /** 강의 리스트 조회 (오프셋 기반 페이지네이션) */
  async findMany(
    options: {
      page: number;
      limit: number;
      instructorId?: string;
      search?: string;
      day?: number;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<{ lectures: LectureListItem[]; totalCount: number }> {
    const client = tx ?? this.prisma;
    const { page, limit, instructorId, search, day } = options;

    // 숫자를 한글 요일로 매핑
    const DAY_MAP: Record<number, string> = {
      0: '일',
      1: '월',
      2: '화',
      3: '수',
      4: '목',
      5: '금',
      6: '토',
    };

    const where: Prisma.LectureWhereInput = {
      deletedAt: null,
      instructorId: instructorId ? { equals: instructorId } : undefined,
      OR: search
        ? [
            { title: { contains: search, mode: QueryMode.insensitive } },
            { subject: { contains: search, mode: QueryMode.insensitive } },
          ]
        : undefined,
      // day 필터링: lectureTimes에 해당 요일이 있는 강의만 조회
      ...(day !== undefined && {
        lectureTimes: {
          some: {
            day: DAY_MAP[day],
          },
        },
      }),
    };

    const [lectures, totalCount] = await Promise.all([
      client.lecture.findMany({
        where,
        include: {
          instructor: {
            select: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
          lectureTimes:
            day !== undefined
              ? {
                  where: { day: DAY_MAP[day] },
                }
              : true,
          _count: {
            select: {
              lectureEnrollments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      client.lecture.count({ where }),
    ]);

    return {
      lectures: lectures as unknown as LectureListItem[],
      totalCount,
    };
  }

  /** 강의 수정 */
  async update(
    id: string,
    instructorId: string,
    data: Partial<{
      title: string;
      subject: string;
      description: string;
      startAt: Date | null;
      endAt: Date | null;
      status: string;
    }>,
    lectureTimes?: { day: string; startTime: string; endTime: string }[],
    tx?: Prisma.TransactionClient,
  ): Promise<LectureWithTimes> {
    const client = tx ?? this.prisma;

    if (lectureTimes !== undefined) {
      const updateWithTimes = async (innerTx: Prisma.TransactionClient) => {
        // 1. 기존 lectureTimes 삭제
        await innerTx.lectureTime.deleteMany({
          where: { lectureId: id },
        });

        // 2. 새로운 lectureTimes 생성 (배열이 비어있지 않은 경우에만)
        if (lectureTimes.length > 0) {
          await innerTx.lectureTime.createMany({
            data: lectureTimes.map((time) => ({
              lectureId: id,
              instructorId, // instructorId 필요함 (매개변수로 받아야 함)
              day: time.day,
              startTime: time.startTime,
              endTime: time.endTime,
            })),
          });
        }

        // 3. Lecture 업데이트
        await innerTx.lecture.update({
          where: { id, deletedAt: null },
          data,
        });

        // 4. lectureTimes 포함하여 반환
        return await innerTx.lecture.findUniqueOrThrow({
          where: { id },
          include: { lectureTimes: true },
        });
      };

      if (tx) {
        return await updateWithTimes(tx);
      } else {
        return await this.prisma.$transaction(updateWithTimes);
      }
    } else {
      // lectureTimes 업데이트 없이 기존 로직
      await client.lecture.update({
        where: { id, deletedAt: null },
        data,
      });

      return await client.lecture.findUniqueOrThrow({
        where: { id },
        include: { lectureTimes: true },
      });
    }
  }

  /** 강의 soft delete */
  async softDelete(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    await client.lecture.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
}
