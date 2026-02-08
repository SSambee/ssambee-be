import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class MaterialsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 자료 생성 */
  async create(
    data: Prisma.MaterialUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.material.create({ data });
  }

  /** ID로 단일 조회 (업로더 정보 포함, 삭제되지 않은 것만) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.material.findFirst({
      where: { id, deletedAt: null },
      include: {
        lecture: {
          select: { title: true },
        },
      },
    });
  }

  /** 자료 목록 조회 (페이지네이션, 삭제되지 않은 것만) */
  async findMany(
    params: {
      lectureId?: string;
      page: number;
      limit: number;
      type?: string;
      search?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { lectureId, page, limit, type, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MaterialWhereInput = {
      deletedAt: null,
      ...(lectureId && {
        OR: [
          { lectureId },
          {
            instructorPostAttachments: {
              some: {
                instructorPost: { lectureId },
              },
            },
          },
        ],
      }),
      ...(type && { type }),
      ...(search && {
        title: { contains: search, mode: 'insensitive' },
      }),
    };

    const [materials, totalCount] = await Promise.all([
      client.material.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lecture: {
            select: { title: true },
          },
        },
      }),
      client.material.count({ where }),
    ]);

    return { materials, totalCount };
  }

  /** ID 목록으로 다건 조회 (삭제되지 않은 것만) */
  async findByIds(ids: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.material.findMany({
      where: { id: { in: ids }, deletedAt: null },
    });
  }

  /** 자료 수정 */
  async update(
    id: string,
    data: Prisma.MaterialUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.material.updateMany({
      where: { id, deletedAt: null },
      data,
    });
  }

  /** 자료 삭제 (Soft Delete) */
  async softDelete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.material.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  /** 영구 삭제 (관리자용 또는 필요시) */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.material.delete({
      where: { id },
    });
  }

  /** 학생의 자료 접근 권한 확인 (게시글 타겟팅 기준) */
  async isAccessibleByStudent(
    materialId: string,
    enrollmentId: string,
    lectureId?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const client = tx ?? this.prisma;
    // 자료가 게시글에 첨부되어 있는지 확인
    const attachments = await client.instructorPostAttachment.findMany({
      where: {
        materialId,
        ...(lectureId && { instructorPost: { lectureId } }),
      },
      include: {
        instructorPost: {
          include: {
            targets: {
              where: { enrollmentId },
            },
          },
        },
      },
    });

    // 첨부된 게시글이 없으면 → 일반 강의 자료로 간주 (수강 중이면 접근 가능)
    if (attachments.length === 0) return true;

    // 첨부된 게시글 중 하나라도 접근 가능한지 확인
    // (LECTURE/GLOBAL 스코프거나, SELECTED 스코프이면서 타겟에 포함되어 있어야 함)
    return attachments.some((att) => {
      const post = att.instructorPost;
      if (post.scope === 'LECTURE' || post.scope === 'GLOBAL') return true;
      if (post.scope === 'SELECTED') {
        return post.targets.length > 0;
      }
      return false;
    });
  }
}
