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
}
