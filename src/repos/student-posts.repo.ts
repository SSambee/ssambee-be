import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  InquiryWriterType,
  StudentPostStatus,
} from '../constants/posts.constant.js';

export type StudentPostWithDetails = Prisma.StudentPostGetPayload<{
  select: {
    id: true;
    status: true;
    title: true;
    content: true;
    createdAt: true;
    updatedAt: true;
    enrollmentId: true;
    authorRole: true;
    instructorId: true;
    lectureId: true;
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
      select: {
        id: true;
        content: true;
        createdAt: true;
        updatedAt: true;
        instructorPostId: true;
        studentPostId: true;
        instructorId: true;
        assistantId: true;
        enrollmentId: true;
        instructor: { select: { user: { select: { name: true } } } };
        assistant: { select: { user: { select: { name: true } } } };
        enrollment: {
          select: {
            studentName: true;
            appStudentId: true;
            appParentLink: { select: { appParentId: true } };
          };
        };
        attachments: {
          select: {
            id: true;
            filename: true;
            fileUrl: true;
            materialId: true;
            material: true;
          };
        };
      };
    };
    _count: { select: { comments: true } };
  };
}>;

export type StudentPostListItem = Prisma.StudentPostGetPayload<{
  include: {
    enrollment: {
      select: {
        studentName: true;
        appStudentId: true;
        appParentLink: { select: { appParentId: true } };
      };
    };
    attachments: true;
    _count: { select: { comments: true } };
  };
}>;

export class StudentPostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 학생 질문 생성 */
  async create(
    data: Prisma.StudentPostUncheckedCreateInput & {
      attachments?: { filename: string; fileUrl: string }[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { attachments, ...postData } = data;

    return client.studentPost.create({
      data: {
        ...postData,
        attachments: attachments?.length
          ? {
              create: attachments,
            }
          : undefined,
      },
      include: {
        attachments: true,
      },
    });
  }

  /** ID로 상세 조회 (댓글 포함) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.studentPost.findUnique({
      where: { id },
      include: {
        attachments: true,
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
            enrollment: {
              select: {
                studentName: true,
                appStudentId: true,
                appParentLink: { select: { appParentId: true } },
              },
            },
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
      writerType?: InquiryWriterType;
      search?: string;
      page: number;
      limit: number;
      orderBy?: 'latest' | 'oldest';
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
      writerType,
      search,
      page,
      limit,
      orderBy,
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
    };

    const [posts, totalCount] = await Promise.all([
      client.studentPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: orderBy === 'oldest' ? 'asc' : 'desc' },
        include: {
          enrollment: {
            select: {
              studentName: true,
              appStudentId: true,
              appParentLink: { select: { appParentId: true } },
            },
          },
          attachments: true,
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

  /** 질문 수정 (title, content, attachments 수정 가능) */
  async update(
    id: string,
    data: Prisma.StudentPostUpdateInput & {
      attachments?: { filename: string; fileUrl: string }[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { attachments, ...postData } = data;

    if (attachments !== undefined) {
      await client.studentPostAttachment.deleteMany({
        where: { studentPostId: id },
      });

      if (attachments.length > 0) {
        await client.studentPostAttachment.createMany({
          data: attachments.map((a) => ({
            studentPostId: id,
            filename: a.filename,
            fileUrl: a.fileUrl,
          })),
        });
      }
    }

    return client.studentPost.update({
      where: { id },
      data: postData,
      include: {
        attachments: true,
      },
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
        status: StudentPostStatus.BEFORE,
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

  /** 첨부파일 ID로 조회 (다운로드용) */
  async findAttachmentById(
    attachmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.studentPostAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        studentPost: {
          select: {
            id: true,
            enrollmentId: true,
            instructorId: true,
            authorRole: true,
          },
        },
      },
    });
  }

  /** 강사별 질문 통계 조회 */
  async getStats(instructorId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const now = new Date();

    // 1. 이번 달 기준 (1일 00:00:00)
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 2. 지난 달 기준 (1일 00:00:00 ~ 말일 23:59:59)
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    // 3. 지연 기준 (1시간 전)
    const oneHourAgo = new Date(now);
    oneHourAgo.setHours(now.getHours() - 1);

    const [
      totalCount,
      thisMonthCount,
      lastMonthCount,
      unansweredCount,
      delayedCount,
      processingCount,
      answeredThisMonthCount,
    ] = await Promise.all([
      // 전체 누적 게시글
      client.studentPost.count({
        where: { instructorId },
      }),
      // 이번 달 생성된 게시글
      client.studentPost.count({
        where: {
          instructorId,
          createdAt: { gte: startOfThisMonth },
        },
      }),
      // 지난 달 생성된 게시글
      client.studentPost.count({
        where: {
          instructorId,
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      // 미답변 게시글 (BEFORE 상태 전체)
      client.studentPost.count({
        where: {
          instructorId,
          status: StudentPostStatus.BEFORE,
        },
      }),
      // 지연된 게시글 (BEFORE 상태이고 1시간 이상 지남)
      client.studentPost.count({
        where: {
          instructorId,
          status: StudentPostStatus.BEFORE,
          createdAt: { lt: oneHourAgo },
        },
      }),
      // 답변 진행 중 (REGISTERED 상태)
      client.studentPost.count({
        where: {
          instructorId,
          status: StudentPostStatus.REGISTERED,
        },
      }),
      // 이번 달 답변 완료 (COMPLETED 상태이며, 변경일이 이번 달)
      client.studentPost.count({
        where: {
          instructorId,
          status: StudentPostStatus.COMPLETED,
          updatedAt: { gte: startOfThisMonth },
        },
      }),
    ]);

    return {
      totalCount,
      thisMonthCount,
      lastMonthCount,
      unansweredCount,
      processingCount,
      unansweredCriteria: delayedCount,
      answeredThisMonthCount,
    };
  }
}
