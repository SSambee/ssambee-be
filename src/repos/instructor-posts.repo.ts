import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { PostScope } from '../constants/posts.constant.js';

export class InstructorPostsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 강사 공지 생성 (트랜잭션 지원) */
  async create(
    data: Prisma.InstructorPostUncheckedCreateInput & {
      materialIds?: string[];
      targetEnrollmentIds?: string[];
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const { materialIds, targetEnrollmentIds, ...postData } = data;

    // materialIds가 있으면 Material 정보를 조회하여 filename 포함
    let attachmentsData: { materialId: string; filename: string }[] | undefined;
    if (materialIds?.length) {
      const materials = await client.material.findMany({
        where: { id: { in: materialIds } },
        select: { id: true, title: true },
      });
      attachmentsData = materials.map((m) => ({
        materialId: m.id,
        filename: m.title,
      }));
    }

    return client.instructorPost.create({
      data: {
        ...postData,
        // 첨부파일 연결
        attachments: attachmentsData?.length
          ? {
              create: attachmentsData,
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
    });
  }

  /** ID로 상세 조회 (댓글, 첨부파일, 타겟 포함) */
  async findById(id: string) {
    return this.prisma.instructorPost.findFirst({
      where: { id }, // Soft Delete가 없으므로 그대로 조회 (필요시 추가)
      include: {
        instructor: { select: { user: { select: { name: true } } } },
        authorAssistant: {
          select: { user: { select: { name: true } } },
        },
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
    scope?: string;
    search?: string;
    page: number;
    limit: number;
  }) {
    const { lectureId, instructorId, scope, search, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.InstructorPostWhereInput = {
      ...(lectureId && { lectureId }),
      ...(instructorId && { instructorId }),
      ...(scope && { scope }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [posts, totalCount] = await Promise.all([
      this.prisma.instructorPost.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          instructor: { select: { user: { select: { name: true } } } },
          authorAssistant: {
            select: { user: { select: { name: true } } },
          },
          attachments: { include: { material: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.instructorPost.count({ where }),
    ]);

    return { posts, totalCount };
  }

  /** 게시글 수정 (재조회 반환) */
  async update(id: string, data: Prisma.InstructorPostUpdateInput) {
    // 1. 업데이트 수행
    await this.prisma.instructorPost.updateMany({
      where: { id },
      data, // updatedAt은 @updatedAt에 의해 자동 갱신되지만 updateMany에서는 안될 수 있음. 확인 필요.
      // Prisma updateMany does NOT update @updatedAt automatically.
      // But usually we pass 'updatedAt: new Date()' from service or expect explicit field.
      // Here assuming service passes necessary fields or we add updatedAt.
    });

    // 2. 재조회 및 반환
    const updated = await this.prisma.instructorPost.findUnique({
      where: { id },
    });

    return updated;
  }

  /** 게시글 삭제 */
  async delete(id: string) {
    return this.prisma.instructorPost.delete({
      where: { id },
    });
  }

  /** 첨부파일 추가 */
  async addAttachments(postId: string, materialIds: string[]) {
    // Material 정보를 조회하여 filename 포함
    const materials = await this.prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, title: true },
    });

    return this.prisma.instructorPostAttachment.createMany({
      data: materials.map((m) => ({
        instructorPostId: postId,
        materialId: m.id,
        filename: m.title,
      })),
      skipDuplicates: true,
    });
  }

  /** 첨부파일 제거 */
  async removeAttachments(postId: string, materialIds: string[]) {
    return this.prisma.instructorPostAttachment.deleteMany({
      where: {
        instructorPostId: postId,
        materialId: { in: materialIds },
      },
    });
  }
}
