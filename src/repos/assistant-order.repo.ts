import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface CreateOrderAttachmentData {
  materialId?: string;
  filename: string;
  fileUrl?: string;
}

export interface CreateAssistantOrderData {
  assistantId: string;
  title: string;
  memo?: string;
  priority?: string;
  lectureId?: string;
  deadlineAt?: Date;
  attachments?: CreateOrderAttachmentData[];
}

export interface UpdateAssistantOrderData {
  title?: string;
  memo?: string;
  status?: string;
  priority?: string;
  lectureId?: string;
  deadlineAt?: Date;
  attachments?: CreateOrderAttachmentData[];
}

export class AssistantOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    return client.assistantOrder.findUnique({
      where: { id },
      include: {
        instructor: {
          select: {
            id: true,
            user: {
              select: { name: true },
            },
          },
        },
        assistant: {
          select: { id: true, name: true },
        },
        lecture: {
          select: { id: true, title: true },
        },
        attachments: true,
      },
    });
  }

  async create(
    instructorId: string,
    data: CreateAssistantOrderData,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { attachments, ...rest } = data;

    return client.assistantOrder.create({
      data: {
        ...rest,
        instructorId,
        attachments: attachments
          ? {
              create: attachments,
            }
          : undefined,
      },
      include: {
        attachments: true,
      },
    });
  }

  async findManyByInstructorId(
    instructorId: string,
    params: {
      status?: string;
      page: number;
      limit: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { status, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AssistantOrderWhereInput = {
      instructorId,
      ...(status && { status }),
    };

    const [orders, totalCount] = await Promise.all([
      client.assistantOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assistant: {
            select: { id: true, name: true },
          },
          lecture: {
            select: { id: true, title: true },
          },
          attachments: true,
        },
      }),
      client.assistantOrder.count({ where }),
    ]);

    return { orders, totalCount };
  }

  async update(
    id: string,
    data: UpdateAssistantOrderData,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { attachments, ...rest } = data;

    // 첨부파일 업데이트 로직: 기존 첨부파일 삭제 후 새로 생성
    // (더 정교하게 하려면 변경된 것만 처리할 수 있지만, 여기서는 단순화)
    const updateData: Prisma.AssistantOrderUpdateInput = {
      ...rest,
    };

    if (attachments) {
      updateData.attachments = {
        deleteMany: {},
        create: attachments,
      };
    }

    return client.assistantOrder.update({
      where: { id },
      data: updateData,
      include: {
        attachments: true,
      },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    return client.assistantOrder.update({
      where: { id },
      data: { status },
    });
  }

  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;

    return client.assistantOrder.delete({
      where: { id },
    });
  }
}
