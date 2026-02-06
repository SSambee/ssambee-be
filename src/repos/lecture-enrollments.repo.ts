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

  /** 강의 ID와 Enrollment ID로 LectureEnrollment 조회 */
  async findByLectureIdAndEnrollmentId(
    lectureId: string,
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findUnique({
      where: {
        lectureId_enrollmentId: {
          lectureId,
          enrollmentId,
        },
      },
      include: {
        enrollment: true,
      },
    });
  }

  /** 특정 강의의 모든 수강 명단 조회 (Enrollment 정보 포함) - 일괄 처리를 위함 */
  async findManyByLectureIdWithEnrollments(
    lectureId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findMany({
      where: {
        lectureId,
        enrollment: {
          deletedAt: null, // 삭제되지 않은 학생만
          status: 'ACTIVE',
        },
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

  /** [NEW] LectureEnrollment ID로 기본 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findUnique({
      where: { id },
    });
  }

  /** 학생이 특정 강의에 수강 등록되어 있는지 확인 */
  async existsByLectureIdAndStudentId(
    lectureId: string,
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await client.lectureEnrollment.count({
      where: {
        lectureId,
        enrollment: {
          appStudentId,
          deletedAt: null,
        },
      },
    });
    return count > 0;
  }

  /** 강의 ID와 Enrollment ID로 수강생 삭제 (Hard Delete) */
  async removeByLectureIdAndEnrollmentId(
    lectureId: string,
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.delete({
      where: {
        lectureId_enrollmentId: {
          lectureId,
          enrollmentId,
        },
      },
    });
  }
}
