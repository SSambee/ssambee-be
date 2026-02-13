import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class AssignmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 과제 생성 */
  async create(
    data: {
      instructorId: string;
      lectureId: string;
      categoryId: string;
      title: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignment.create({
      data,
    });
  }

  /** 강사의 과제 목록 조회 (선택적 강의 필터링) */
  async findByInstructorId(
    instructorId: string,
    lectureId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignment.findMany({
      where: {
        instructorId,
        ...(lectureId ? { lectureId } : {}),
      },
      include: {
        category: true,
        lecture: true,
      },
      orderBy: { title: 'asc' },
    });
  }

  /** ID로 과제 조회 (결과 포함) */
  async findByIdWithResults(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignment.findUnique({
      where: { id },
      include: {
        category: true,
        lecture: true,
        assignmentResults: {
          include: {
            lectureEnrollment: {
              include: {
                enrollment: true,
              },
            },
          },
        },
      },
    });
  }

  /** ID로 과제 조회 (기본) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignment.findUnique({
      where: { id },
      include: {
        category: true,
        lecture: true,
      },
    });
  }

  /** 과제 수정 */
  async update(
    id: string,
    data: { title?: string; categoryId?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignment.update({
      where: { id },
      data,
    });
  }

  /** 과제 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignment.delete({
      where: { id },
    });
  }
}
