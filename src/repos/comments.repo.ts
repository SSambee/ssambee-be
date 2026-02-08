import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class CommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 댓글 생성 (첨부파일 포함) */
  async create(
    data: Prisma.CommentUncheckedCreateInput & { materialIds?: string[] },
  ) {
    const { materialIds, ...commentData } = data;

    // materialIds가 있으면 Material 정보를 조회하여 filename 포함
    let attachmentsData: { materialId: string; filename: string }[] | undefined;
    if (materialIds?.length) {
      const materials = await this.prisma.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, title: true },
      });
      attachmentsData = materials.map((m) => ({
        materialId: m.id,
        filename: m.title,
      }));
    }

    return this.prisma.comment.create({
      data: {
        ...commentData,
        attachments: attachmentsData?.length
          ? {
              create: attachmentsData,
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
