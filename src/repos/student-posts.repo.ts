import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  AnswerStatus,
  InquiryWriterType,
  StudentPostStatus,
} from '../constants/posts.constant.js';

export type StudentPostWithDetails = Prisma.StudentPostGetPayload<{
  include: {
    enrollment: {
      select: {
        appStudentId: true;
        studentName: true;
        appStudent: {
          select: { user: { select: { name: true } } };
        };
        appParentLink: { select: { appParentId: true; name: true } };
      };
    };
    comments: {
      include: {
        instructor: { select: { user: { select: { name: true } } } };
        assistant: { select: { user: { select: { name: true } } } };
        enrollment: { select: { studentName: true } };
        attachments: { include: { material: true } };
      };
    };
    _count: { select: { comments: true } };
  };
}>;

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
            appStudent: {
              select: { user: { select: { name: true } } },
            },
            appParentLink: { select: { appParentId: true, name: true } },
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
      enrollmentIds?: string[]; // [NEW] 학부모용 필터링
      status?: string;
      answerStatus?: AnswerStatus;
      writerType?: InquiryWriterType;
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
      enrollmentIds, // [NEW]
      status,
      answerStatus,
      writerType,
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
      ...(enrollmentIds && { enrollmentId: { in: enrollmentIds } }), // [NEW] 학부모용
      ...(status && { status }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
      // 작성자 유형 필터링
      ...(writerType &&
        writerType !== InquiryWriterType.ALL && {
          authorRole: writerType,
        }),
      // 답변 상태 필터링 (answerStatus → StudentPost status 매핑)
      // BEFORE → PENDING, REGISTERED → RESOLVED, COMPLETED → COMPLETED
      ...(answerStatus === AnswerStatus.BEFORE && {
        status: StudentPostStatus.PENDING,
      }),
      ...(answerStatus === AnswerStatus.REGISTERED && {
        status: StudentPostStatus.RESOLVED,
      }),
      ...(answerStatus === AnswerStatus.COMPLETED && {
        status: StudentPostStatus.COMPLETED,
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
            select: {
              studentName: true,
              appStudentId: true,
              appParentLink: { select: { appParentId: true } },
            },
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

  /** 만료된 PENDING 질문 조회 (배치용) */
  async findManyPendingExpired(
    expirationDate: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPost.findMany({
      where: {
        status: StudentPostStatus.PENDING,
        createdAt: {
          lt: expirationDate,
        },
      },
      select: { id: true },
    });
  }

  /** 여러 질문 상태 일괄 변경 */
  async updateManyStatus(
    ids: string[],
    status: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPost.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }
}
