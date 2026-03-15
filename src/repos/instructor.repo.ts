import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

interface CreateInstructorData {
  userId: string;
  phoneNumber: string;
  subject?: string;
  academy?: string;
}

export class InstructorRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructor.findUnique({ where: { userId } });
  }

  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructor.findUnique({
      where: { id },
      include: { user: { select: { name: true } } },
    });
  }

  async findByPhoneNumber(phoneNumber: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructor.findFirst({ where: { phoneNumber } });
  }

  async create(data: CreateInstructorData, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructor.create({ data });
  }
}
