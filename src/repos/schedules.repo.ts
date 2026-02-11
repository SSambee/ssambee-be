import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class SchedulesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 일정 생성 */
  async create(
    data: {
      instructorId: string;
      title: string;
      memo?: string;
      startTime: Date;
      endTime: Date;
      categoryId?: string | null;
      authorName: string;
      authorRole: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.create({
      data,
      include: {
        category: true,
      },
    });
  }

  /** ID로 일정 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.schedule.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });
  }

  /**
   * 일정 목록 조회
   * 1) 기간 필터 (start/end)
   * 2) 카테고리 필터 (specific ID or null for 'other')
   */
  async findMany(
    instructorId: string,
    filter: {
      startDate?: Date;
      endDate?: Date;
      categoryId?: string | null; // null: 카테고리 없음(other), undefined: 전체
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const where: Prisma.ScheduleWhereInput = {
      instructorId,
    };

    // 기간 필터
    if (filter.startDate || filter.endDate) {
      where.startTime = {};
      // 겹치는 일정 조회
      // (TargetStart < FilterEnd) AND (TargetEnd > FilterStart)
      // 즉: Schedule.startTime <= FilterEndDate AND Schedule.endTime >= FilterStartDate

      if (filter.startDate) {
        where.endTime = {
          gte: filter.startDate,
        };
      }
      if (filter.endDate) {
        where.startTime = {
          lte: filter.endDate,
        };
      }
    }

    // 카테고리 필터
    if (filter.categoryId !== undefined) {
      where.categoryId = filter.categoryId;
    }

    return client.schedule.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  /** 일정 수정 */
  async update(
    id: string,
    data: {
      title?: string;
      memo?: string;
      startTime?: Date;
      endTime?: Date;
      categoryId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.schedule.update({
      where: { id },
      data,
      include: {
        category: true,
      },
    });
  }

  /** 일정 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.schedule.delete({
      where: { id },
    });
  }
}
