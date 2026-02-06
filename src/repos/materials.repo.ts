import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class MaterialsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 자료 생성 */
  async create(
    data: Prisma.MaterialUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return client.material.create({ data });
  }

  /** ID로 단일 조회 (업로더 정보 포함, 삭제되지 않은 것만) */
  async findById(id: string) {
    return this.prisma.material.findFirst({
      where: { id, deletedAt: null },
      include: {
        instructor: {
          select: { user: { select: { name: true } } },
        },
        assistant: {
          select: {
            instructorId: true,
            user: { select: { name: true } },
          },
        },
      },
    });
  }

  /** 자료 목록 조회 (페이지네이션, 삭제되지 않은 것만) */
  async findMany(params: {
    lectureId?: string;
    page: number;
    limit: number;
    type?: string;
    search?: string;
  }) {
    const { lectureId, page, limit, type, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MaterialWhereInput = {
      deletedAt: null,
      ...(lectureId && { lectureId }),
      ...(type && { type }),
      ...(search && {
        title: { contains: search, mode: 'insensitive' },
      }),
    };

    const [materials, totalCount] = await Promise.all([
      this.prisma.material.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          instructor: {
            select: { user: { select: { name: true } } },
          },
          assistant: {
            select: { user: { select: { name: true } } },
          },
        },
      }),
      this.prisma.material.count({ where }),
    ]);

    return { materials, totalCount };
  }

  /** ID 목록으로 다건 조회 (삭제되지 않은 것만) */
  async findByIds(ids: string[]) {
    return this.prisma.material.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });
  }

  /** 자료 수정 */
  async update(id: string, data: Prisma.MaterialUpdateInput) {
    return this.prisma.material.update({
      where: { id },
      data,
    });
  }

  /** 자료 삭제 (Soft Delete) */
  async softDelete(id: string) {
    return this.prisma.material.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** 영구 삭제 (관리자용 또는 필요시) */
  async delete(id: string) {
    return this.prisma.material.delete({
      where: { id },
    });
  }
}
