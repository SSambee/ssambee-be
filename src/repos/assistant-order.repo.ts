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
}
