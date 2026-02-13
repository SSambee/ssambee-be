import { PrismaClient } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';

export class ProfileRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 강사 프로필 + 개설 강의 조회
   */
  async getInstructorProfileWithLectures(instructorId: string) {
    return this.prisma.instructor.findUnique({
      where: { id: instructorId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            userType: true,
          },
        },
        lectures: {
          where: { deletedAt: null },
          select: {
            id: true,
            title: true,
            schoolYear: true,
            status: true,
            _count: {
              select: { lectureEnrollments: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * 강사 프로필 수정
   */
  async updateInstructorProfile(
    instructorId: string,
    data: {
      name?: string;
      phoneNumber?: string;
      subject?: string;
      academy?: string;
    },
  ) {
    const { name, ...instructorData } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. Instructor 정보 업데이트
      const instructor = await tx.instructor.update({
        where: { id: instructorId },
        data: instructorData,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              userType: true,
            },
          },
        },
      });

      // 2. User 이름 업데이트 (있는 경우)
      if (name) {
        await tx.user.update({
          where: { id: instructor.userId },
          data: { name },
        });
        instructor.user.name = name;
      }

      return instructor;
    });
  }

  /**
   * 조교 프로필 + 소속 강사 정보 + 강사의 강의 목록 조회 (memo 제외)
   */
  async getAssistantProfileWithInstructorLectures(assistantId: string) {
    const assistant = await this.prisma.assistant.findUnique({
      where: { id: assistantId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            userType: true,
          },
        },
        instructor: {
          select: {
            id: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!assistant) {
      return null;
    }

    // 소속 강사의 강의 목록 조회
    const lectures = await this.prisma.lecture.findMany({
      where: {
        instructorId: assistant.instructorId,
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        schoolYear: true,
        status: true,
        _count: {
          select: { lectureEnrollments: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...assistant,
      instructorLectures: lectures,
    };
  }

  /**
   * 조교 프로필 수정 (User.name과 Assistant.name 동기화)
   */
  async updateAssistantProfile(
    assistantId: string,
    data: {
      name?: string;
      phoneNumber?: string;
    },
  ) {
    const { name, phoneNumber } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. Assistant 조회 to get userId
      const currentAssistant = await tx.assistant.findUniqueOrThrow({
        where: { id: assistantId },
      });

      const updateData: Prisma.AssistantUpdateInput = {};
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (name) updateData.name = name;

      // 2. Assistant 정보 업데이트
      const assistant = await tx.assistant.update({
        where: { id: assistantId },
        data: updateData,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              userType: true,
            },
          },
        },
      });

      // 3. User 이름 업데이트 (있는 경우) - Assistant.name과 동기화
      if (name && currentAssistant.userId) {
        await tx.user.update({
          where: { id: currentAssistant.userId },
          data: { name },
        });
        if (assistant.user) {
          assistant.user.name = name;
        }
      }

      return assistant;
    });
  }
}
