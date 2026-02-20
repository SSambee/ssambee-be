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

  /**
   * 학생 프로필 + Enrollment 기반 강사 목록 조회
   */
  async getStudentProfileWithEnrollments(appStudentId: string) {
    return this.prisma.appStudent.findUnique({
      where: { id: appStudentId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            userType: true,
          },
        },
        enrollments: {
          where: { deletedAt: null },
          select: {
            instructor: {
              select: {
                id: true,
                academy: true,
                subject: true,
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  /**
   * 학생 프로필 업데이트 + 모든 Enrollment 동기화
   */
  async updateStudentProfile(
    appStudentId: string,
    data: {
      name?: string;
      phoneNumber?: string;
      parentPhoneNumber?: string;
      school?: string;
      schoolYear?: string;
    },
  ) {
    const { name, ...studentData } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. AppStudent 조회 (userId 확보)
      const currentStudent = await tx.appStudent.findUniqueOrThrow({
        where: { id: appStudentId },
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      // 2. AppStudent 정보 업데이트
      const student = await tx.appStudent.update({
        where: { id: appStudentId },
        data: studentData,
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

      // 3. User.name 업데이트 (있는 경우)
      if (name) {
        await tx.user.update({
          where: { id: currentStudent.userId },
          data: { name },
        });
        student.user.name = name;
      }

      // 4. 모든 Enrollment 동기화
      const enrollmentUpdateData: Prisma.EnrollmentUpdateManyMutationInput = {};
      if (name) enrollmentUpdateData.studentName = name;
      if (data.phoneNumber) {
        enrollmentUpdateData.studentPhone = data.phoneNumber;
      }
      if (data.parentPhoneNumber) {
        enrollmentUpdateData.parentPhone = data.parentPhoneNumber;
      }
      if (data.school) {
        enrollmentUpdateData.school = data.school;
      }
      if (data.schoolYear) {
        enrollmentUpdateData.schoolYear = data.schoolYear;
      }

      if (Object.keys(enrollmentUpdateData).length > 0) {
        await tx.enrollment.updateMany({
          where: {
            appStudentId: appStudentId,
            deletedAt: null,
          },
          data: enrollmentUpdateData,
        });
      }

      // 4. AppStudent의 최신 정보로 미연결 수강생까지 추가 매핑
      const matchedStudentName = name ?? currentStudent.user.name;
      const matchedStudentPhone =
        data.phoneNumber ?? currentStudent.phoneNumber;
      const matchedParentPhone =
        data.parentPhoneNumber ?? currentStudent.parentPhoneNumber;

      if (matchedStudentName && matchedStudentPhone && matchedParentPhone) {
        await tx.enrollment.updateMany({
          where: {
            appStudentId: null,
            deletedAt: null,
            studentPhone: matchedStudentPhone,
            studentName: matchedStudentName,
            parentPhone: matchedParentPhone,
          },
          data: { appStudentId: student.id },
        });
      }

      return student;
    });
  }

  /**
   * 학부모 프로필 + 자녀 링크 목록 조회
   */
  async getParentProfileWithChildren(appParentId: string) {
    return this.prisma.appParent.findUnique({
      where: { id: appParentId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            userType: true,
          },
        },
        childLinks: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * 학부모 프로필 업데이트
   */
  async updateParentProfile(
    appParentId: string,
    data: {
      name?: string;
      phoneNumber?: string;
    },
  ) {
    const { name, phoneNumber } = data;

    return this.prisma.$transaction(async (tx) => {
      // 1. AppParent 조회 (userId 확보)
      const currentParent = await tx.appParent.findUniqueOrThrow({
        where: { id: appParentId },
      });

      const updateData: Prisma.AppParentUpdateInput = {};
      if (phoneNumber) updateData.phoneNumber = phoneNumber;

      // 2. AppParent 정보 업데이트
      const parent = await tx.appParent.update({
        where: { id: appParentId },
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

      // 3. User.name 업데이트 (있는 경우)
      if (name) {
        await tx.user.update({
          where: { id: currentParent.userId },
          data: { name },
        });
        parent.user.name = name;
      }

      return parent;
    });
  }
}
