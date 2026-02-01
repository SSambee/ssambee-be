import { PrismaClient } from '../generated/prisma/client.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { PermissionService } from './permission.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  CreateLectureDto,
  GetLecturesQueryDto,
  UpdateLectureDto,
} from '../validations/lectures.validation.js';

import type { Lecture, Enrollment } from '../generated/prisma/client.js';

export type LectureWithEnrollments = Lecture & { enrollments?: Enrollment[] };

export type GetLecturesResponse = {
  lectures: {
    id: string;
    title: string;
    subject: string | null;
    status: string;
    startAt: Date | null;
    instructorName: string;
    enrollmentsCount: number;
    lectureTimes: {
      day: string;
      startTime: string;
      endTime: string;
    }[];
  }[];
  pagination: {
    totalCount: number;
    totalPage: number;
    currentPage: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

export class LecturesService {
  constructor(
    private readonly lecturesRepository: LecturesRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly studentRepository: StudentRepository,
    private readonly instructorRepository: InstructorRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 강의 생성 */
  async createLecture(
    instructorId: string,
    data: CreateLectureDto,
  ): Promise<LectureWithEnrollments> {
    const instructor = await this.instructorRepository.findById(instructorId);

    if (!instructor) throw new NotFoundException('강사를 찾을 수 없습니다.');

    return await this.prisma.$transaction(async (tx) => {
      // 1. 강의 생성
      const lecture = await this.lecturesRepository.create(
        { ...data, instructorId },
        tx,
      );

      // 2. 수강생 생성 (있는 경우)
      let enrollments: Enrollment[] = [];
      if (data.enrollments && data.enrollments.length > 0) {
        const enrollmentData = data.enrollments.map((e) => ({
          ...e,
          lectureId: lecture.id,
          instructorId,
          status: EnrollmentStatus.ACTIVE,
        }));
        enrollments = await this.enrollmentsRepository.createMany(
          enrollmentData,
          tx,
        );
      }

      return { ...lecture, enrollments };
    });
  }

  /** 강의 리스트 조회 */
  async getLectures(
    instructorId: string,
    query: GetLecturesQueryDto,
  ): Promise<GetLecturesResponse> {
    const { page = 1, limit = 4, search, day } = query;

    const { lectures, totalCount } = await this.lecturesRepository.findMany({
      page,
      limit,
      instructorId,
      search,
      day,
    });

    const mappedLectures = lectures.map((lecture) => ({
      id: lecture.id,
      title: lecture.title,
      subject: lecture.subject,
      status: lecture.status,
      startAt: lecture.startAt,
      instructorName: lecture.instructor.user.name,
      enrollmentsCount: lecture._count.enrollments,
      lectureTimes: lecture.lectureTimes.map((lt) => ({
        day: lt.day,
        startTime: lt.startTime,
        endTime: lt.endTime,
      })),
    }));

    return {
      lectures: mappedLectures,
      pagination: {
        totalCount,
        totalPage: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
    };
  }

  /** 강의 개별 조회 */
  async getLectureById(
    profileId: string,
    userType: UserType,
    id: string,
  ): Promise<Lecture> {
    const lecture = await this.lecturesRepository.findById(id);

    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    return lecture;
  }

  /** 강의 수정 */
  async updateLecture(
    profileId: string,
    userType: UserType,
    id: string,
    data: UpdateLectureDto,
  ): Promise<Lecture> {
    const lecture = await this.lecturesRepository.findById(id);

    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // undefined를 제외한 필드만 추출
    const updatePayload = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined),
    );

    return await this.lecturesRepository.update(id, updatePayload);
  }

  /** 강의 삭제 (Soft Delete) */
  async deleteLecture(
    profileId: string,
    userType: UserType,
    id: string,
  ): Promise<void> {
    const lecture = await this.lecturesRepository.findById(id);

    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    await this.lecturesRepository.softDelete(id);
  }
}
