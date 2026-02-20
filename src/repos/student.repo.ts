import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

interface CreateStudentData {
  userId: string;
  phoneNumber: string;
  parentPhoneNumber?: string;
  school?: string;
  schoolYear?: string;
}

export class StudentRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async findByUserId(userId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appStudent.findUnique({ where: { userId } });
  }

  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appStudent.findUnique({ where: { id } });
  }

  async findByPhoneNumber(phoneNumber: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appStudent.findUnique({ where: { phoneNumber } });
  }

  async findByPhoneNumberAndProfile(
    phoneNumber: string,
    studentName: string,
    parentPhoneNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.appStudent.findFirst({
      where: {
        phoneNumber,
        parentPhoneNumber,
        user: {
          name: studentName,
        },
      },
    });
  }

  async create(data: CreateStudentData, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.appStudent.create({ data });
  }
}
