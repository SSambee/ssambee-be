import { PrismaClient, Enrollment } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import { getPagingParams } from '../utils/pagination.util.js';
import { GetSvcEnrollmentsQueryDto } from '../validations/enrollments.validation.js';

export class EnrollmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** --- 조회 --- */

  /** 학생 ID로 수강 목록 조회 (Lecture, Instructor 포함) */
  async findByAppStudentId(
    appStudentId: string,
    query: Partial<GetSvcEnrollmentsQueryDto> = {},
    tx?: Prisma.TransactionClient,
  ) {
    return this.findManyWithPagination(
      { appStudentId, status: EnrollmentStatus.ACTIVE },
      query,
      tx,
    );
  }

  /* 학부모-자녀 연결 ID로 수강 목록 조회 (Lecture, Instructor 포함) */
  async findByAppParentLinkId(
    appParentLinkId: string,
    query: Partial<GetSvcEnrollmentsQueryDto> = {},
    tx?: Prisma.TransactionClient,
  ) {
    return this.findManyWithPagination(
      { appParentLinkId, status: EnrollmentStatus.ACTIVE },
      query,
      tx,
    );
  }

  /** 여러 학부모-자녀 연결 ID로 모든 활성 수강 목록 조회 (No Pagination) */
  async findManyByAppParentLinkIds(
    appParentLinkIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.findMany({
      where: {
        appParentLinkId: { in: appParentLinkIds },
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: [{ registeredAt: 'desc' }, { studentName: 'asc' }],
    });
  }

  /** 강사 ID와 학생 전화번호 목록으로 Enrollment 조회 */
  async findManyByInstructorAndPhones(
    instructorId: string,
    studentPhones: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.findMany({
      where: {
        instructorId,
        studentPhone: {
          in: studentPhones,
        },
        deletedAt: null,
      },
    });
  }

  /** 공통 페이징 조회 헬퍼 (Internal) */
  private async findManyWithPagination(
    baseWhere: Prisma.EnrollmentWhereInput,
    query: Partial<GetSvcEnrollmentsQueryDto>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { page = 1, limit = 20, keyword } = query;
    const { skip, take } = getPagingParams(page, limit);

    const where: Prisma.EnrollmentWhereInput = {
      ...baseWhere,
      deletedAt: null,
    };

    if (keyword) {
      where.AND = [
        {
          OR: [],
        },
      ];
    }

    const [enrollments, totalCount] = await Promise.all([
      client.enrollment.findMany({
        where,
        include: {
          // lecture 관계 삭제됨
        },
        orderBy: [{ registeredAt: 'desc' }, { studentName: 'asc' }],
        skip,
        take,
      }),
      client.enrollment.count({ where }),
    ]);

    return { enrollments, totalCount };
  }

  /** Enrollment ID로 상세 조회 (관계 포함) */
  async findByIdWithRelations(
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.findFirst({
      where: {
        id: enrollmentId,
        deletedAt: null,
      },
      include: {
        lectureEnrollments: true, // 대신 수강 이력 포함
      },
    });
  }

  /** Enrollment ID로 상세 조회 (Lecture 포함) */
  async findByIdWithLectures(
    enrollmentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.findFirst({
      where: {
        id: enrollmentId,
        deletedAt: null,
      },
      include: {
        lectureEnrollments: {
          include: {
            lecture: {
              include: {
                lectureTimes: true,
              },
            },
          },
          orderBy: {
            registeredAt: 'desc',
          },
        },
        instructor: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  /** ID로 간단 조회 (권한 체크 및 기본 정보 확인용) */
  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Enrollment | null> {
    const client = tx ?? this.prisma;
    return await client.enrollment.findUnique({
      where: { id },
    });
  }

  /** 여러 ID로 Enrollment 조회 (존재 여부 확인용) */
  async findByIds(ids: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    if (!ids || ids.length === 0) return [];
    return await client.enrollment.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
    });
  }

  /** 수강생 목록 조회 (검색/필터/페이지네이션) - 통합됨 */
  async findMany(
    instructorId: string,
    params: {
      page: number;
      limit: number;
      keyword?: string;
      year?: string;
      status?: EnrollmentStatus;
      lectureId?: string;
      examId?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const { page, limit, keyword, year, status, lectureId, examId } = params;

    // 검색 조건 구성
    const where: Prisma.EnrollmentWhereInput = {
      instructorId,
      deletedAt: status === EnrollmentStatus.DROPPED ? undefined : null,
    };

    if (status) {
      where.status = status;
    }

    if (year) {
      where.schoolYear = year;
    }

    if (keyword) {
      where.OR = [
        { studentName: { contains: keyword } },
        { school: { contains: keyword } },
        { studentPhone: { contains: keyword } },
        { parentPhone: { contains: keyword } },
      ];
    }

    // 강의 필터링
    if (lectureId) {
      where.lectureEnrollments = {
        some: {
          lectureId,
        },
      };
    }

    // 데이터 조회 (페이지네이션)
    const { skip, take } = getPagingParams(page, limit);
    const [enrollments, totalCount] = await Promise.all([
      client.enrollment.findMany({
        where,
        include: {
          appStudent: true,
          attendances: {
            orderBy: { date: 'desc' },
            take: 1,
          },
          lectureEnrollments: {
            include: {
              grades: examId
                ? {
                    where: { examId: examId },
                    select: { id: true },
                    take: 1,
                  }
                : undefined,
              lecture: true,
            },
            orderBy: {
              registeredAt: 'desc',
            },
          },
        },
        orderBy: [
          { registeredAt: 'desc' }, // 최신 등록순
          { studentName: 'asc' }, // 이름 오름차순
        ],
        skip,
        take,
      }),
      client.enrollment.count({ where }),
    ]);

    return {
      enrollments,
      totalCount,
    };
  }

  /** --- 생성 --- */

  /** 수강생 일괄 등록 */
  async createMany(
    dataList: Prisma.EnrollmentUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.createManyAndReturn({
      data: dataList,
    });
  }

  /** 수강생 개별 등록 */
  async create(
    data: Prisma.EnrollmentUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.create({
      data,
    });
  }

  /** --- 수정 --- */

  /** 수강 정보 수정 */
  async update(
    id: string,
    data: Prisma.EnrollmentUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.update({
      where: { id },
      data,
    });
  }

  /** --- 삭제 --- */

  /** Soft Delete */
  async softDelete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.enrollment.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: EnrollmentStatus.DROPPED, // 삭제 시 상태도 변경하는 것이 안전
      },
    });
  }

  /** --- 연동 --- */

  /** 전화번호 기준 AppStudentId 업데이트 (회원가입 시 연동) */
  async updateAppStudentIdByPhoneNumber(
    phoneNumber: string,
    appStudentId: string,
    studentName: string,
    parentPhoneNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.updateMany({
      where: {
        studentPhone: phoneNumber,
        studentName,
        parentPhone: parentPhoneNumber,
        appStudentId: null,
      },
      data: {
        appStudentId,
      },
    });
  }

  /** 학생 전화번호 기준 AppParentLinkId 업데이트 (자녀 등록 시 연동) */
  async updateAppParentLinkIdByStudentPhone(
    studentPhone: string,
    appParentLinkId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.enrollment.updateMany({
      where: {
        studentPhone: studentPhone,
        appParentLinkId: null, // 아직 연동되지 않은 건들이만
      },
      data: {
        appParentLinkId,
      },
    });
  }
}
