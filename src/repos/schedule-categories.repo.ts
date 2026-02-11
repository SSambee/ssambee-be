import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class ScheduleCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 카테고리 생성 */
  async create(
    data: {
      instructorId: string;
      name: string;
      color: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.create({
      data,
    });
  }

  /** 강사의 모든 카테고리 조회 */
  async findByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.findMany({
      where: { instructorId },
      orderBy: { name: 'asc' }, // 이름순 정렬
    });
  }

  /** ID로 카테고리 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.findUnique({
      where: { id },
    });
  }

  /** 이름 중복 확인용 조회 */
  async findByInstructorIdAndName(
    instructorId: string,
    name: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.findUnique({
      where: {
        instructorId_name: {
          instructorId,
          name,
        },
      },
    });
  }

  /** 색상 중복 확인용 조회 */
  async findByInstructorIdAndColor(
    instructorId: string,
    color: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.findUnique({
      where: {
        instructorId_color: {
          instructorId,
          color,
        },
      },
    });
  }

  /** 카테고리 수정 */
  async update(
    id: string,
    data: { name?: string; color?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.update({
      where: { id },
      data,
    });
  }

  /** 카테고리 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.scheduleCategory.delete({
      where: { id },
    });
  }
}
