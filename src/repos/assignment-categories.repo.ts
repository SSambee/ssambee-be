import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class AssignmentCategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 카테고리 생성 */
  async create(
    data: {
      instructorId: string;
      name: string;
      resultPresets: string[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentCategory.create({
      data,
    });
  }

  /** 강사의 모든 카테고리 조회 */
  async findByInstructorId(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentCategory.findMany({
      where: { instructorId },
      orderBy: { name: 'asc' }, // 이름순 정렬
    });
  }

  /** ID로 카테고리 조회 */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignmentCategory.findUnique({
      where: { id },
    });
  }

  /** 이름 중복 확인용 조회 */
  async findByInstructorIdAndName(
    instructorId: string,
    name: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    // 이름에 대한 unique 제약조건이 없으므로 findFirst 사용
    return client.assignmentCategory.findFirst({
      where: {
        instructorId,
        name,
      },
    });
  }

  /** 카테고리 수정 */
  async update(
    id: string,
    data: { name?: string; resultPresets?: string[] },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.assignmentCategory.update({
      where: { id },
      data,
    });
  }

  /** 카테고리 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.assignmentCategory.delete({
      where: { id },
    });
  }
}
