import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

export class AttendancesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 단일 출결 생성 */
  async create(
    data: Prisma.AttendanceUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.attendance.create({
      data,
    });
  }

  /** Upsert (등록 시 중복 방지 및 수정 지원) */
  async upsert(
    where: Prisma.AttendanceWhereUniqueInput,
    create: Prisma.AttendanceUncheckedCreateInput,
    update: Prisma.AttendanceUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.attendance.upsert({
      where,
      create,
      update,
    });
  }

  /** ID로 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.attendance.findUnique({
      where: { id },
    });
  }

  // 수강생별 출결 목록 조회 (날짜 내림차순)
  async findByEnrollmentId(
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.attendance.findMany({
      where: {
        enrollmentId,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  // [NEW] LectureEnrollment 단위 출결 목록 조회 (날짜 내림차순)
  async findByLectureEnrollmentId(
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.attendance.findMany({
      where: {
        lectureEnrollmentId,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  // 출결 수정
  async update(
    id: string,
    data: Prisma.AttendanceUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.attendance.update({
      where: { id },
      data,
    });
  }
  // 출석 통계 조회 (총 출석 수, 결석 수)
  async getAttendanceStatsByLectureEnrollment(
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const [totalCount, absentCount] = await Promise.all([
      client.attendance.count({
        where: { lectureEnrollmentId },
      }),
      client.attendance.count({
        where: {
          lectureEnrollmentId,
          status: 'ABSENT',
        },
      }),
    ]);

    return { totalCount, absentCount };
  }
}
