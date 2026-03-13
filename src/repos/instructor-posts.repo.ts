import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PostScope } from '../constants/posts.constant.js';
import { PostType } from '../constants/posts.constant.js';

export type InstructorPostWithDetails = Prisma.InstructorPostGetPayload<{
  include: {
    instructor: { select: { user: { select: { name: true } } } };
    authorAssistant: {
      select: { user: { select: { name: true } } };
    };
    attachments: { include: { material: true } };
    targets: {
      include: {
        enrollment: {
          select: { appStudentId: true };
        };
      };
    };
    lecture: { select: { title: true } };
    _count: { select: { comments: true } };
  };
}>;

export type StudentFiltering = {
  lectureIds: string[];
  instructorIds: string[];
  enrollmentIds: string[];
};

export class InstructorPostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 강사 공지 생성 (트랜잭션 지원) */
  async create(
    data: Prisma.InstructorPostUncheckedCreateInput & {
      materialIds?: string[];
      attachments?: { filename: string; fileUrl: string }[];
      targetEnrollmentIds?: string[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { materialIds, attachments, targetEnrollmentIds, ...postData } = data;

    // 1. 라이브러리 자료 첨부 데이터
    let materialAttachments:
      | { materialId: string; filename: string }[]
      | undefined;
    if (materialIds?.length) {
      const materials = await client.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, title: true },
      });
      materialAttachments = materials.map((m) => ({
        materialId: m.id,
        filename: m.title,
      }));
    }

    // 2. 직접 첨부 데이터
    const directAttachments =
      attachments?.map((a) => ({
        filename: a.filename,
        fileUrl: a.fileUrl,
      })) || [];

    // 3. 결합
    const allAttachments = [
      ...(materialAttachments || []),
      ...directAttachments,
    ];

    return client.instructorPost.create({
      data: {
        ...postData,
        // 첨부파일 연결
        attachments: allAttachments.length
          ? {
              create: allAttachments,
            }
          : undefined,
        // 타겟 학생 연결 (SELECTED 스코프일 때)
        targets:
          postData.scope === PostScope.SELECTED && targetEnrollmentIds?.length
            ? {
                create: targetEnrollmentIds.map((id) => ({ enrollmentId: id })),
              }
            : undefined,
      },
      include: {
        attachments: { include: { material: true } },
        targets: {
          include: {
            enrollment: {
              select: { appStudentId: true, studentName: true },
            },
          },
        },
      },
    });
  }

  /** ID로 상세 조회 (댓글, 첨부파일, 타겟 포함) */
  async findById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructorPost.findFirst({
      where: { id }, // Soft Delete가 없으므로 그대로 조회 (필요시 추가)
      include: {
        instructor: { select: { user: { select: { name: true } } } },
        authorAssistant: {
          select: { user: { select: { name: true } } },
        },
        lecture: { select: { title: true } },
        attachments: {
          include: {
            material: true,
          },
        },
        targets: {
          include: {
            enrollment: {
              select: {
                appStudentId: true, // Permission check용
                studentName: true,
              },
            },
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
      scope?: string;
      search?: string;
      page: number;
      limit: number;
      targetEnrollmentIds?: string[];
      postType?: PostType;
      orderBy?: 'latest' | 'oldest';
      // [SECURITY] CASL 인가 필터
      abilityFilter?: Prisma.InstructorPostWhereInput;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const {
      lectureId,
      instructorId,
      scope,
      search,
      page,
      limit,
      targetEnrollmentIds,
      postType,
      orderBy,
      abilityFilter,
    } = params;
    const skip = (page - 1) * limit;

    // 검색 조건 (title 또는 content에 포함)
    const searchCondition = search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' as const } },
            { content: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const where: Prisma.InstructorPostWhereInput = {
      AND: [
        ...(lectureId ? [{ lectureId }] : []),
        ...(instructorId ? [{ instructorId }] : []),
        ...(scope ? [{ scope }] : []),
        ...(postType ? [{ isImportant: postType === PostType.NOTICE }] : []),
        ...(searchCondition ? [searchCondition] : []),
        ...(abilityFilter ? [abilityFilter] : []),
        ...(targetEnrollmentIds?.length
          ? [
              {
                scope: PostScope.SELECTED,
                targets: {
                  some: {
                    enrollmentId: { in: targetEnrollmentIds },
                  },
                },
              },
            ]
          : []),
      ],
    };

    const [posts, totalCount] = await Promise.all([
      client.instructorPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: orderBy === 'oldest' ? 'asc' : 'desc' },
        include: {
          instructor: { select: { user: { select: { name: true } } } },
          authorAssistant: {
            select: { user: { select: { name: true } } },
          },
          attachments: { include: { material: true } },
          targets: {
            include: {
              enrollment: {
                select: { appStudentId: true },
              },
            },
          },
          lecture: { select: { title: true } },
          _count: { select: { comments: true } },
        },
      }),
      client.instructorPost.count({ where }),
    ]);

    return { posts, totalCount };
  }

  /** 게시글 수정 */
  async update(
    id: string,
    data: Prisma.InstructorPostUncheckedUpdateInput & {
      materialIds?: string[];
      attachments?: { filename: string; fileUrl: string }[];
      targetEnrollmentIds?: string[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const { materialIds, attachments, targetEnrollmentIds, ...postData } = data;
    const client = tx ?? this.prisma;

    // 첨부파일 데이터 준비
    let allAttachmentsToCreate:
      | { materialId?: string; filename: string; fileUrl?: string }[]
      | undefined;

    if (materialIds !== undefined || attachments !== undefined) {
      allAttachmentsToCreate = [];

      // 1. 라이브러리 자료 첨부
      if (materialIds?.length) {
        const materials = await client.material.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, title: true },
        });
        const materialAttachments = materials.map((m) => ({
          materialId: m.id,
          filename: m.title,
        }));
        allAttachmentsToCreate.push(...materialAttachments);
      }

      // 2. 직접 첨부
      if (attachments?.length) {
        const directAttachments = attachments.map((a) => ({
          filename: a.filename,
          fileUrl: a.fileUrl,
        }));
        allAttachmentsToCreate.push(...directAttachments);
      }
    }

    // Prisma의 nested update를 사용하여 원자성 보장 및 코드 간소화
    await client.instructorPost.update({
      where: { id },
      data: {
        ...postData,
        // 첨부파일 관계 업데이트 (기존 삭제 후 새 생성)
        attachments:
          allAttachmentsToCreate !== undefined
            ? {
                deleteMany: {},
                create: allAttachmentsToCreate,
              }
            : undefined,
        // 타겟 관계 업데이트 (기존 삭제 후 새 생성)
        targets:
          targetEnrollmentIds !== undefined
            ? {
                deleteMany: {},
                create: targetEnrollmentIds.map((enrollmentId) => ({
                  enrollmentId,
                })),
              }
            : undefined,
      },
    });

    // 재조회 및 반환
    return this.findById(id, client);
  }

  /** 게시글 삭제 */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.instructorPost.delete({
      where: { id },
    });
  }

  /** 첨부파일 추가 */
  async addAttachments(
    postId: string,
    materialIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    // Material 정보를 조회하여 filename 포함
    const materials = await client.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, title: true },
    });

    return client.instructorPostAttachment.createMany({
      data: materials.map((m) => ({
        instructorPostId: postId,
        materialId: m.id,
        filename: m.title,
      })),
      skipDuplicates: true,
    });
  }

  /** 첨부파일 제거 */
  async removeAttachments(
    postId: string,
    materialIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.instructorPostAttachment.deleteMany({
      where: {
        instructorPostId: postId,
        materialId: { in: materialIds },
      },
    });
  }
}
