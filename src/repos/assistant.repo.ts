import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

interface CreateAssistantData {
  userId: string;
  phoneNumber: string;
  instructorId: string;
  signupCode: string;
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
      include: { user: { select: { name: true } } },
    });
  }
}
