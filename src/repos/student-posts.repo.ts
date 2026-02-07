import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export class StudentPostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 학생 질문 생성 */
  async create(data: Prisma.StudentPostUncheckedCreateInput) {
    return this.prisma.studentPost.create({
      data,
    });
  }

  /** ID로 상세 조회 (댓글 포함) */
  async findById(id: string) {
    return this.prisma.studentPost.findUnique({
      where: { id },
      include: {
        enrollment: {
          select: {
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
  async findMany(params: {
    lectureId?: string;
    instructorId?: string;
    enrollmentId?: string; // 내 질문 조회용
    appStudentId?: string; // 추가
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
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
      ...(appStudentId && { enrollment: { appStudentId } }), // 추가
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [posts, totalCount] = await Promise.all([
      this.prisma.studentPost.findMany({
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
      this.prisma.studentPost.count({ where }),
    ]);

    return { posts, totalCount };
  }

  /** 상태 변경 (재조회 반환) */
  async updateStatus(id: string, status: string) {
    await this.prisma.studentPost.updateMany({
      where: { id },
      data: { status, updatedAt: new Date() },
    });

    return this.prisma.studentPost.findUnique({ where: { id } });
  }

  /** 질문 삭제 (Soft Delete 없음, 실제 삭제?) */
  // 기획상 삭제 언급은 없으나 기본 CRUD로 제공
  async delete(id: string) {
    return this.prisma.studentPost.delete({
      where: { id },
    });
  }
}
