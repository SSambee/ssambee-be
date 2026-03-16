import { PrismaClient } from '../generated/prisma/client.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import { LectureStatus } from '../constants/lectures.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async countActiveEnrollmentsByInstructor(instructorId: string) {
    return this.prisma.enrollment.count({
      where: {
        instructorId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  }

  async countInProgressLecturesByInstructor(instructorId: string) {
    return this.prisma.lecture.count({
      where: {
        instructorId,
        deletedAt: null,
        status: LectureStatus.IN_PROGRESS,
      },
    });
  }

  async countScheduledLecturesByInstructor(instructorId: string) {
    return this.prisma.lecture.count({
      where: {
        instructorId,
        deletedAt: null,
        status: LectureStatus.SCHEDULED,
      },
    });
  }

  async countNewEnrollmentsByInstructorInLast48Hours(
    instructorId: string,
    since: Date,
  ) {
    return this.prisma.enrollment.count({
      where: {
        instructorId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        registeredAt: {
          gte: since,
        },
      },
    });
  }

  async countUnfinishedExamsByInstructor(instructorId: string) {
    return this.prisma.exam.count({
      where: {
        instructorId,
        gradingStatus: {
          not: GradingStatus.COMPLETED,
        },
      },
    });
  }

  async findTodayOngoingLecturesByInstructor(
    instructorId: string,
    day: string,
  ) {
    const candidateDays = [day, `${day}요일`];

    return this.prisma.lecture.findMany({
      where: {
        instructorId,
        deletedAt: null,
        status: LectureStatus.IN_PROGRESS,
        lectureTimes: {
          some: {
            day: {
              in: candidateDays,
            },
          },
        },
      },
      include: {
        lectureTimes: {
          where: {
            day: {
              in: candidateDays,
            },
          },
          orderBy: {
            startTime: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findLatestClinicsByInstructor(instructorId: string, take = 5) {
    return this.prisma.clinic.findMany({
      where: {
        OR: [
          { instructorId },
          {
            lecture: {
              instructorId,
            },
          },
        ],
      },
      include: {
        lecture: {
          select: {
            id: true,
            title: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            examDate: true,
            cutoffScore: true,
            gradingStatus: true,
          },
        },
        lectureEnrollment: {
          select: {
            id: true,
            enrollment: {
              select: {
                id: true,
                studentName: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
  }
}
