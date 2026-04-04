import { PrismaClient } from '../generated/prisma/client.js';
import type { Admin, Prisma } from '../generated/prisma/client.js';

export class AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).admin.findUnique({
      where: { userId },
    });
  }

  async create(
    data: Omit<Admin, 'createdAt' | 'updatedAt'> & {
      createdAt?: Date;
      updatedAt?: Date | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).admin.create({
      data,
    });
  }

  async updateByUserId(
    userId: string,
    data: Prisma.AdminUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).admin.update({
      where: { userId },
      data,
    });
  }
}
