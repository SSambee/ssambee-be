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
}
