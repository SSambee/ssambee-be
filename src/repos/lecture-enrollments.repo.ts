import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

export class LectureEnrollmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 강의 수강생 일괄 등록 */
  async createMany(
    dataList: Prisma.LectureEnrollmentUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.createManyAndReturn({
      data: dataList,
    });
  }

  /** 강의 수강생 개별 등록 */
  async create(
    data: Prisma.LectureEnrollmentUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.create({
      data,
    });
  }

  /** 강의별 수강 명단 조회 (Enrollment 정보 포함) */
  async findManyByLectureId(lectureId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findMany({
      where: {
        lectureId,
      },
      include: {
        enrollment: true,
      },
    });
  }

  /** [NEW] 학생(AppStudent)의 수강 강의 목록 조회 */
  async findManyByAppStudentId(
    appStudentId: string,
    params: {
      limit: number;
      offset: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { limit, offset } = params;

    const [lectureEnrollments, totalCount] = await Promise.all([
      client.lectureEnrollment.findMany({
        where: {
          enrollment: {
            appStudentId,
            deletedAt: null, // Enrollment(관계)가 삭제되지 않은 경우
          },
          // LectureEnrollment 자체의 삭제 여부나 강의 status 확인 필요 시 추가
        },
        include: {
          lecture: {
            include: {
              instructor: {
                select: {
                  user: {
                    select: { name: true },
                  },
                },
              },
              lectureTimes: true,
            },
          },
        },
        orderBy: {
          registeredAt: 'desc',
        },
        skip: offset,
        take: limit,
      }),
      client.lectureEnrollment.count({
        where: {
          enrollment: {
            appStudentId,
            deletedAt: null,
          },
        },
      }),
    ]);

    return { lectureEnrollments, totalCount };
  }

  /** [NEW] 학부모 자녀 연동(AppParentChildLink) 기준 수강 강의 목록 조회 */
  async findManyByAppParentLinkId(
    appParentLinkId: string,
    params: {
      limit: number;
      offset: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { limit, offset } = params;

    const [lectureEnrollments, totalCount] = await Promise.all([
      client.lectureEnrollment.findMany({
        where: {
          enrollment: {
            appParentLinkId,
            deletedAt: null,
          },
        },
        include: {
          lecture: {
            include: {
              instructor: {
                select: {
                  user: {
                    select: { name: true },
                  },
                },
              },
              lectureTimes: true,
            },
          },
          enrollment: {
            select: {
              studentName: true,
            },
          },
        },
        orderBy: {
          registeredAt: 'desc',
        },
        skip: offset,
        take: limit,
      }),
      client.lectureEnrollment.count({
        where: {
          enrollment: {
            appParentLinkId,
            deletedAt: null,
          },
        },
      }),
    ]);

    return { lectureEnrollments, totalCount };
  }

  /** [NEW] LectureEnrollment 상세 조회 (강의 상세, 성적, 출석, 과제 포함) */
  async findByIdWithDetails(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findUnique({
      where: { id },
      include: {
        // 1. 강의 기본 정보 (시간표, 시험 목록 포함)
        lecture: {
          include: {
            instructor: {
              select: {
                user: {
                  select: { name: true },
                },
              },
            },
            lectureTimes: true,
            exams: {
              orderBy: { id: 'desc' },
              take: 5, // 최근 시험 5개만?
            },
          },
        },
        // 2. 이 강의에서의 학생 활동 정보
        enrollment: true,
        grades: {
          orderBy: { createdAt: 'desc' },
          include: {
            exam: true,
          },
        },
        attendances: {
          orderBy: { date: 'desc' },
          take: 10, // 최근 출석 10건
        },
      },
    });
  }
}
