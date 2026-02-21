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

  /** 학생의 모든 유효 수강 목록 조회 (필터링 데이터 구축용) */
  async findAllByAppStudentId(
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.lectureEnrollment.findMany({
      where: {
        enrollment: {
          appStudentId,
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
      include: {
        lecture: true,
      },
    });
  }

  /** 학부모 자녀 연동(AppParentChildLink) 기준 수강 강의 목록 조회 */
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

  /** LectureEnrollment 상세 조회 (강의 상세, 성적, 출석, 과제 포함) */
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

  /** 학생이 특정 강사의 강의를 하나라도 수강 중인지 확인 */
  async existsByInstructorIdAndStudentId(
    instructorId: string,
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await client.lectureEnrollment.count({
      where: {
        enrollment: {
          instructorId,
          appStudentId,
          deletedAt: null,
        },
      },
    });
    return count > 0;
  }

  /** 학생이 특정 강의에 수강 등록되어 있는지 조회 */
  async findByLectureIdAndStudentId(
    lectureId: string,
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findFirst({
      where: {
        lectureId,
        enrollment: {
          appStudentId,
          deletedAt: null,
        },
      },
      include: {
        enrollment: true,
      },
    });
  }

  /** 학생이 특정 강사의 강의를 수강 중인지 확인하고 첫 번째 Enrollment 반환 */
  async findFirstByInstructorIdAndStudentId(
    instructorId: string,
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findFirst({
      where: {
        enrollment: {
          instructorId,
          appStudentId,
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
      include: {
        enrollment: true,
      },
    });
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

  /** [NEW] 강의수강생 상세 조회 (성적 포함) */
  async findByIdWithGrades(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findUnique({
      where: { id },
      include: {
        lecture: {
          include: {
            instructor: {
              select: {
                user: { select: { name: true } },
              },
            },
          },
        },
        enrollment: {
          select: {
            id: true,
            studentName: true,
            school: true,
            status: true,
          },
        },
        grades: {
          include: {
            exam: {
              select: {
                title: true,
                examDate: true,
                subject: true,
                averageScore: true,
                gradesCount: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /** 여러 Enrollment ID 중 하나라도 특정 강의를 수강 중인지 확인 (학부모용) */
  async existsByLectureIdAndEnrollmentIds(
    lectureId: string,
    enrollmentIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    if (!enrollmentIds || enrollmentIds.length === 0) return false;

    const count = await client.lectureEnrollment.count({
      where: {
        lectureId,
        enrollmentId: { in: enrollmentIds },
        enrollment: {
          deletedAt: null,
          status: 'ACTIVE',
        },
      },
    });
    return count > 0;
  }

  /** 특정 Enrollment ID에 속한 모든 수강 강의 목록 조회 */
  async findManyByEnrollmentId(
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findMany({
      where: {
        enrollmentId,
        enrollment: {
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
      },
      orderBy: {
        registeredAt: 'desc',
      },
    });
  }

  /** 여러 Enrollment ID로 LectureEnrollment 조회 (학부모용) */
  async findManyByEnrollmentIds(
    enrollmentIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    if (!enrollmentIds || enrollmentIds.length === 0) return [];

    return client.lectureEnrollment.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
      },
      include: {
        lecture: {
          select: {
            id: true,
            instructorId: true,
            title: true,
            lectureTimes: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  /** [NEW] 강의 ID와 학생 전화번호로 LectureEnrollment 조회 (학부모 질문 작성용) */
  async findByLectureIdAndStudentPhone(
    lectureId: string,
    studentPhone: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.lectureEnrollment.findFirst({
      where: {
        lectureId,
        enrollment: {
          studentPhone,
          deletedAt: null,
        },
      },
      include: {
        enrollment: true,
      },
    });
  }
}
