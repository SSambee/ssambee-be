import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class CommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 댓글 생성 (첨부파일 포함) */
  async create(
    data: Prisma.CommentUncheckedCreateInput & { materialIds?: string[] },
  ) {
    const { materialIds, ...commentData } = data;

    return this.prisma.comment.create({
      data: {
        ...commentData,
        attachments: materialIds?.length
          ? {
              create: materialIds.map((id) => ({ materialId: id })),
            }
          : undefined,
      },
      include: {
        instructor: { select: { user: { select: { name: true } } } },
        assistant: { select: { user: { select: { name: true } } } },
        enrollment: { select: { studentName: true } },
        attachments: { include: { material: true } },
      },
    });
  }

  /** 댓글 삭제 */
  async delete(id: string) {
    return this.prisma.comment.delete({
      where: { id },
    });
  }

  /** 댓글 단건 조회 (권한 확인용) */
  async findById(id: string) {
    return this.prisma.comment.findUnique({
      where: { id },
    });
  }
}
