import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AssistantSignStatus } from '../constants/assistants.constant.js';

interface CreateAssistantData {
  userId: string;
  name: string;
  phoneNumber: string;
  instructorId: string;
  signupCode: string;
}

interface UpdateAssistantData {
  name?: string;
  phoneNumber?: string;
  contract?: string;
  memo?: string;
}

export class AssistantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistant.findUnique({ where: { userId } });
  }

  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistant.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
  }

  async findByPhoneNumber(phoneNumber: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistant.findFirst({ where: { phoneNumber } });
  }

  async create(data: CreateAssistantData, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistant.create({ data });
  }

  async findAllByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assistant.findMany({
      where: { instructorId },
      include: {
        user: {
          select: { name: true },
        },
      },
    });
  }

  async update(
    id: string,
    data: UpdateAssistantData,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assistant.update({
      where: { id },
      data,
    });
  }

  async updateSignStatus(
    id: string,
    signStatus: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assistant.update({
      where: { id },
      data: { signStatus },
    });
  }

  async softDelete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assistant.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        phoneNumber: null,
      },
    });
  }

  async findManyByInstructorId(
    instructorId: string,
    signStatus?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const where: Prisma.AssistantWhereInput = {
      instructorId,
    };

    if (signStatus) {
      where.signStatus = signStatus;
    }

    return client.assistant.findMany({
      where,
      include: {
        user: signStatus === AssistantSignStatus.SIGNED,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
