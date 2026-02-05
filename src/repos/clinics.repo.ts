import { PrismaClient, Prisma } from '../generated/prisma/client.js';

export class ClinicsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 해당 시험의 불합격 성적 조회 (LectureEnrollment 정보 포함)
   * isPass = false 인 Grade 조회
   */
  async findFailedGradesByExamId(
    examId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.grade.findMany({
      where: {
        examId,
        isPass: false,
      },
      include: {
        lectureEnrollment: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentName: true,
                studentPhone: true,
                school: true,
                schoolYear: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * 이미 생성된 클리닉 조회 (중복 방지용)
   */
  async findExistingClinics(
    examId: string,
    lectureEnrollmentIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.clinic.findMany({
      where: {
        examId,
        lectureEnrollmentId: {
          in: lectureEnrollmentIds,
        },
      },
      select: {
        lectureEnrollmentId: true,
      },
    });
  }

  /**
   * 클리닉 일괄 생성
   */
  async createMany(
    data: Array<{
      lectureId: string;
      examId: string;
      lectureEnrollmentId: string;
      title: string;
      deadline?: Date | null;
      memo?: string;
      instructorId?: string;
    }>,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    return await client.clinic.createMany({
      data: data.map((item) => ({
        lectureId: item.lectureId,
        examId: item.examId,
        lectureEnrollmentId: item.lectureEnrollmentId,
        title: item.title,
        deadline: item.deadline,
        memo: item.memo,
        instructorId: item.instructorId,
        status: 'PENDING',
      })),
      skipDuplicates: true, // 중복 키 에러 방지 (@@unique([lectureEnrollmentId, examId]))
    });
  }

  /**
   * 클리닉 일괄 삭제
   */
  async deleteManyByExamAndEnrollments(
    examId: string,
    lectureEnrollmentIds: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.clinic.deleteMany({
      where: {
        examId,
        lectureEnrollmentId: {
          in: lectureEnrollmentIds,
        },
      },
    });
  }

  /**
   * 강사의 클리닉 목록 조회
   */
  async findByInstructor(
    instructorId: string,
    filters?: {
      lectureId?: string;
      examId?: string;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    const where: Prisma.ClinicWhereInput = {
      OR: [
        { instructorId }, // 직접 담당
        { lecture: { instructorId } }, // 강의 담당 강사로서 조회
      ],
      ...(filters?.lectureId && { lectureId: filters.lectureId }),
      ...(filters?.examId && { examId: filters.examId }),
    };

    return await client.clinic.findMany({
      where,
      include: {
        lectureEnrollment: {
          include: {
            enrollment: {
              select: {
                id: true,
                studentName: true,
                school: true,
                schoolYear: true,
                studentPhone: true,
              },
            },
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            cutoffScore: true,
            schedule: {
              select: {
                startTime: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * 다중 클리닉 조회
   */
  async findByIds(clinicIds: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return await client.clinic.findMany({
      where: {
        id: {
          in: clinicIds,
        },
      },
    });
  }

  /**
   * 다중 클리닉 수정
   */
  async updateMany(
    clinicIds: string[],
    data: {
      status?: string;
      deadline?: Date | null;
      memo?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return await client.clinic.updateMany({
      where: {
        id: {
          in: clinicIds,
        },
      },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.deadline !== undefined && { deadline: data.deadline }),
        ...(data.memo !== undefined && { memo: data.memo }),
      },
    });
  }

  /**
   * 학생 ID로 클리닉 목록 조회 (LectureEnrollment.Enrollment 기준)
   */
  async findByAppStudentId(
    appStudentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    return await client.clinic.findMany({
      where: {
        lectureEnrollment: {
          enrollment: {
            appStudentId,
          },
        },
      },
      include: {
        lectureEnrollment: {
          include: {
            enrollment: true,
          },
        },
        exam: true,
        lecture: {
          select: {
            id: true,
            title: true,
            subject: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  /**
   * 학부모 연결 ID로 클리닉 목록 조회 (LectureEnrollment.Enrollment 기준)
   */
  async findByAppParentLinkId(
    appParentLinkId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;

    return await client.clinic.findMany({
      where: {
        lectureEnrollment: {
          enrollment: {
            appParentLinkId,
          },
        },
      },
      include: {
        lectureEnrollment: {
          include: {
            enrollment: true,
          },
        },
        exam: true,
        lecture: {
          select: {
            id: true,
            title: true,
            subject: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
