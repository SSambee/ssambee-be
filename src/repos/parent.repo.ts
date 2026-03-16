import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

interface CreateParentData {
  userId: string;
  phoneNumber: string;
}

export class ParentRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appParent.findUnique({ where: { userId } });
  }

  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appParent.findUnique({ where: { id } });
  }

  async findByPhoneNumber(phoneNumber: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appParent.findUnique({ where: { phoneNumber } });
  }

  async create(data: CreateParentData, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appParent.create({ data });
  }
}
