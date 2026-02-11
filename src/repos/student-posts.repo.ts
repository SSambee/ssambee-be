import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class StudentPostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 학생 질문 생성 */
  async create(
    data: Prisma.StudentPostUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPost.create({
      data,
    });
  }

  /** ID로 상세 조회 (댓글 포함) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.studentPost.findUnique({
      where: { id },
      include: {
        enrollment: {
          select: {
            appStudentId: true, // Permission check용
            studentName: true,
            appStudent: { select: { user: { select: { name: true } } } },
            appParentLink: { select: { name: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            instructor: { select: { user: { select: { name: true } } } },
            assistant: { select: { user: { select: { name: true } } } },
            enrollment: { select: { studentName: true } },
            attachments: { include: { material: true } },
          },
        },
      },
    });
  }

  /** 목록 조회 (필터링, 페이지네이션) */
  async findMany(
    params: {
      lectureId?: string;
      instructorId?: string;
      enrollmentId?: string;
      appStudentId?: string;
      status?: string;
      search?: string;
      page: number;
      limit: number;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const {
      lectureId,
      instructorId,
      enrollmentId,
      appStudentId,
      status,
      search,
      page,
      limit,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.StudentPostWhereInput = {
      ...(lectureId && { lectureId }),
      ...(instructorId && { instructorId }),
      ...(enrollmentId && { enrollmentId }),
      ...(appStudentId && { enrollment: { appStudentId } }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [posts, totalCount] = await Promise.all([
      client.studentPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          enrollment: {
            select: { studentName: true },
          },
          _count: { select: { comments: true } },
        },
      }),
      client.studentPost.count({ where }),
    ]);

    return { posts, totalCount };
  }

  /** 상태 변경 (재조회 반환) */
  async updateStatus(
    id: string,
    status: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPost.update({
      where: { id },
      data: { status },
    });
  }

  /** 질문 수정 (title, content만 수정 가능) */
  async update(
    id: string,
    data: Prisma.StudentPostUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPost.update({
      where: { id },
      data,
    });
  }

  /** 질문 삭제 (Soft Delete 없음, 실제 삭제?) */
  // 기획상 삭제 언급은 없으나 기본 CRUD로 제공
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.studentPost.delete({
      where: { id },
    });
  }
}
