import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class AssignmentResultsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 과제 결과 생성 */
  async create(
    data: {
      assignmentId: string;
      lectureEnrollmentId: string;
      resultIndex: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.create({ data });
  }

  /** ID로 과제 결과 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.findUnique({
      where: { id },
      include: {
        assignment: {
          include: {
            category: true,
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: true,
          },
        },
      },
    });
  }

  /** 특정 과제 + 수강생 조합으로 결과 조회 */
  async findByAssignmentAndEnrollment(
    assignmentId: string,
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.findUnique({
      where: {
        assignmentId_lectureEnrollmentId: {
          assignmentId,
          lectureEnrollmentId,
        },
      },
      include: {
        assignment: {
          include: {
            category: true,
          },
        },
        lectureEnrollment: {
          include: {
            enrollment: true,
          },
        },
      },
    });
  }

  /** 과제 결과 수정 (Unique ID) */
  async updateById(
    id: string,
    data: { resultIndex: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.update({
      where: { id },
      data,
    });
  }

  /** 과제 결과 삭제 (Unique ID) */
  async deleteById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.delete({
      where: { id },
    });
  }

  /** 과제 결과 수정 */
  async update(
    assignmentId: string,
    lectureEnrollmentId: string,
    data: { resultIndex: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.update({
      where: {
        assignmentId_lectureEnrollmentId: {
          assignmentId,
          lectureEnrollmentId,
        },
      },
      data,
    });
  }

  /** 과제 결과 수정/생성 */
  async upsert(
    assignmentId: string,
    lectureEnrollmentId: string,
    data: { resultIndex: number },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.upsert({
      where: {
        assignmentId_lectureEnrollmentId: {
          assignmentId,
          lectureEnrollmentId,
        },
      },
      create: {
        assignmentId,
        lectureEnrollmentId,
        resultIndex: data.resultIndex,
      },
      update: {
        resultIndex: data.resultIndex,
      },
    });
  }

  /** 과제 결과 삭제 */
  async delete(
    assignmentId: string,
    lectureEnrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentResult.delete({
      where: {
        assignmentId_lectureEnrollmentId: {
          assignmentId,
          lectureEnrollmentId,
        },
      },
    });
  }
}
