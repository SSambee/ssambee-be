import { PrismaClient } from '../generated/prisma/client.js';
import type {
  Lecture,
  LectureTime,
  Prisma,
} from '../generated/prisma/client.js';
import { QueryMode } from '../generated/prisma/internal/prismaNamespace.js';
import { CreateLectureWithInstructorIdDto } from '../validations/lectures.validation.js';

export type LectureWithTimes = Lecture & { lectureTimes: LectureTime[] };

type LectureWithRelations = Lecture & {
  instructor: {
    user: {
      name: string;
    };
  };
  lectureTimes: LectureTime[];
  _count: {
    enrollments: number;
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
  ): Promise<LectureWithTimes | null> {
    const client = tx ?? this.prisma;
    return await client.lecture.findUnique({
      where: { id, deletedAt: null },
      include: { lectureTimes: true },
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
  ): Promise<{ lectures: LectureWithRelations[]; totalCount: number }> {
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
              enrollments: true,
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
      lectures: lectures as unknown as LectureWithRelations[],
      totalCount,
    };
  }

  /** 강의 수정 */
  async update(
    id: string,
    data: Partial<{
      title: string;
      subject: string;
      description: string;
      startAt: Date | null;
      endAt: Date | null;
      status: string;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<Lecture> {
    const client = tx ?? this.prisma;
    return await client.lecture.update({
      where: { id, deletedAt: null },
      data,
    });
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
