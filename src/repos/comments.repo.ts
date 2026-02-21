import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { StudentPostStatus } from '../constants/posts.constant.js';

export class CommentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 댓글 생성 (첨부파일 포함) */
  async create(
    data: Prisma.CommentUncheckedCreateInput & {
      materialIds?: string[];
      attachments?: { filename: string; fileUrl: string }[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { materialIds, attachments, ...commentData } = data;

    // 1. 라이브러리 자료(Material) 첨부 데이터 구성
    let materialAttachments:
      | { materialId: string; filename: string }[]
      | undefined;
    if (materialIds?.length) {
      const materials = await client.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, title: true },
      });
      materialAttachments = materials.map((m) => ({
        materialId: m.id,
        filename: m.title,
      }));
    }

    // 2. 직접 첨부(Direct) 데이터 구성
    const directAttachments =
      attachments?.map((a) => ({
        filename: a.filename,
        fileUrl: a.fileUrl,
      })) || [];

    // 3. 결합
    const allAttachments = [
      ...(materialAttachments || []),
      ...directAttachments,
    ];

    return client.comment.create({
      data: {
        ...commentData,
        attachments: allAttachments.length
          ? {
              create: allAttachments,
            }
          : undefined,
      },
      include: {
        instructor: { select: { user: { select: { name: true } } } },
        assistant: { select: { user: { select: { name: true } } } },
        enrollment: {
          select: {
            studentName: true,
            appStudentId: true,
            appParentLink: { select: { appParentId: true } },
          },
        },
        attachments: { include: { material: true } },
      },
    });
  }

  /** 댓글 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.comment.delete({
      where: { id },
    });
  }

  /** 댓글 수정 */
  async update(
    id: string,
    data: {
      content?: string;
      materialIds?: string[];
      attachments?: { filename: string; fileUrl: string }[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { materialIds, attachments, ...commentData } = data;

    // 첨부파일 업데이트: 기존 첨부 삭제 후 새 첨부 추가
    if (materialIds !== undefined || attachments !== undefined) {
      await client.commentAttachment.deleteMany({
        where: { commentId: id },
      });

      // 1. 라이브러리 자료 첨부
      let materialAttachments:
        | { commentId: string; materialId: string; filename: string }[]
        | undefined;
      if (materialIds?.length) {
        const materials = await client.material.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, title: true },
        });
        materialAttachments = materials.map((m) => ({
          commentId: id,
          materialId: m.id,
          filename: m.title,
        }));
      }

      // 2. 직접 첨부
      const directAttachments =
        attachments?.map((a) => ({
          commentId: id,
          filename: a.filename,
          fileUrl: a.fileUrl,
        })) || [];

      const allAttachments = [
        ...(materialAttachments || []),
        ...directAttachments,
      ];

      if (allAttachments.length > 0) {
        await client.commentAttachment.createMany({
          data: allAttachments,
        });
      }
    }

    return client.comment.update({
      where: { id },
      data: commentData,
      include: {
        instructor: { select: { user: { select: { name: true } } } },
        assistant: { select: { user: { select: { name: true } } } },
        enrollment: {
          select: {
            studentName: true,
            appStudentId: true,
            appParentLink: { select: { appParentId: true } },
          },
        },
        attachments: { include: { material: true } },
      },
    });
  }

  /** 댓글 단건 조회 (권한 확인용) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.comment.findUnique({
      where: { id },
    });
  }

  /** 첨부파일 ID로 조회 (다운로드용) */
  async findAttachmentById(
    attachmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.commentAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        comment: {
          select: {
            id: true,
            instructorPostId: true,
            studentPostId: true,
            instructorId: true,
            assistantId: true,
            enrollmentId: true,
          },
        },
        material: true,
      },
    });
  }

  /** 학생 질문에 댓글 작성 + 상태 자동 변경 (트랜잭션) */
  async createCommentWithStudentPostStatusUpdate(
    data: {
      content: string;
      studentPostId: string;
      instructorId: string | null;
      assistantId: string | null;
      enrollmentId: string | null;
      authorRole?: string;
      materialIds?: string[];
      attachments?: { filename: string; fileUrl: string }[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (txClient: Prisma.TransactionClient) => {
      // 학생 질문 상태를 REGISTERED로 변경
      await txClient.studentPost.update({
        where: { id: data.studentPostId },
        data: { status: StudentPostStatus.REGISTERED },
      });

      // 댓글 생성 (기존 create 로직 재사용)
      return this.create(
        {
          content: data.content,
          studentPostId: data.studentPostId,
          instructorId: data.instructorId,
          assistantId: data.assistantId,
          enrollmentId: data.enrollmentId,
          authorRole: data.authorRole,
          materialIds: data.materialIds,
          attachments: data.attachments,
        },
        txClient,
      );
    };

    if (tx) {
      return execute(tx);
    }
    return this.prisma.$transaction(execute);
  }
}
