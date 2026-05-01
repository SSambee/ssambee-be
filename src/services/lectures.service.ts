import { PrismaClient } from '../generated/prisma/client.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import {
  BadRequestException,
  NotFoundException,
} from '../err/http.exception.js';
import {
  LecturesRepository,
  LectureWithTimes,
} from '../repos/lectures.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import { PermissionService } from './permission.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  CreateLectureDto,
  GetLecturesQueryDto,
  UpdateLectureDto,
} from '../validations/lectures.validation.js';

import type {
  Lecture,
  LectureEnrollment,
  Prisma,
} from '../generated/prisma/client.js';

export type LectureWithEnrollments = Lecture & {
  lectureEnrollments?: LectureEnrollment[];
};

type LectureEnrollmentRequest = NonNullable<
  CreateLectureDto['enrollments']
>[number];

export type GetLecturesResponse = {
  lectures: {
    id: string;
    title: string;
    subject: string | null;
    status: string;
    startAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
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

export type LectureDetailResponse = {
  id: string;
  title: string;
  subject: string | null;
  schoolYear: string | null;
  status: string;
  startAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  instructorName: string;
  enrollmentsCount: number;
  lectureTimes: {
    day: string;
    startTime: string;
    endTime: string;
  }[];
  students: {
    id: string; // enrollmentId
    lectureEnrollmentId: string;
    lectureEnrollmentMemo: string | null;
    name: string;
    school: string;
    phone: string;
    parentPhone: string;
  }[];
  exams: {
    id: string;
    title: string;
    status: string; // 임시: 항상 'PENDING' 등으로 반환하거나 기획 확인 필요
    questionCount: number;
    // createdAt: Date; // 삭제
  }[];
};

export class LecturesService {
  constructor(
    private readonly lecturesRepository: LecturesRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly instructorRepository: InstructorRepository,
    private readonly studentRepository: StudentRepository,
    private readonly parentChildLinkRepository: ParentChildLinkRepository,
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
      const enrollmentRequests = data.enrollments ?? [];
      const existingPhoneMap = new Map<
        string,
        Awaited<
          ReturnType<EnrollmentsRepository['findManyByInstructorAndPhones']>
        >[number]
      >();

      if (enrollmentRequests.length > 0) {
        // 1. 요청된 학생들의 전화번호 목록 추출
        const studentPhones = enrollmentRequests.map((e) => e.studentPhone);

        // 2. 기존 Enrollment 조회 (해당 강사의 학생 명단에서)
        const existingEnrollments =
          await this.enrollmentsRepository.findManyByInstructorAndPhones(
            instructorId,
            studentPhones,
            tx,
          );

        for (const existing of existingEnrollments) {
          existingPhoneMap.set(existing.studentPhone, existing);
        }

        for (const enrollmentReq of enrollmentRequests) {
          const existing = existingPhoneMap.get(enrollmentReq.studentPhone);
          if (!existing) continue;

          if (
            existing.studentName !== enrollmentReq.studentName ||
            existing.parentPhone !== enrollmentReq.parentPhone
          ) {
            throw new BadRequestException(
              '이미 등록된 학생 전화번호와 학생 정보가 일치하지 않습니다.',
            );
          }
        }
      }

      // 3. 강의 생성
      const lecture = await this.lecturesRepository.create(
        { ...data, instructorId },
        tx,
      );

      // 4. 수강생 처리 (있는 경우)
      let lectureEnrollments: LectureEnrollment[] = [];
      if (enrollmentRequests.length > 0) {
        const resolveStudentId = async (
          enrollmentReq: LectureEnrollmentRequest,
        ) => {
          const student =
            await this.studentRepository.findByPhoneNumberAndParentPhoneNumber(
              enrollmentReq.studentPhone,
              enrollmentReq.parentPhone,
              tx,
            );
          return student?.id;
        };

        const resolveParentLinkId = async (
          enrollmentReq: LectureEnrollmentRequest,
        ) => {
          const link =
            await this.parentChildLinkRepository.findByPhoneNumberAndParentPhoneNumber(
              enrollmentReq.studentPhone,
              enrollmentReq.parentPhone,
              tx,
            );
          return link?.id;
        };

        // 4-1. 새롭게 생성해야 할 Enrollment와 재사용할 Enrollment 분류
        const newEnrollmentsData: Prisma.EnrollmentUncheckedCreateInput[] = [];
        const pendingLectureEnrollments: Prisma.LectureEnrollmentUncheckedCreateInput[] =
          [];
        const pendingNewLectureEnrollments: LectureEnrollmentRequest[] = [];

        for (const enrollmentReq of enrollmentRequests) {
          const existing = existingPhoneMap.get(enrollmentReq.studentPhone);
          if (existing) {
            const connectionData: Prisma.EnrollmentUpdateInput = {};

            if (!existing.appStudentId) {
              const studentId = await resolveStudentId(enrollmentReq);
              if (studentId) {
                connectionData.appStudent = { connect: { id: studentId } };
              }
            }

            if (!existing.appParentLinkId) {
              const parentLinkId = await resolveParentLinkId(enrollmentReq);
              if (parentLinkId) {
                connectionData.appParentLink = {
                  connect: { id: parentLinkId },
                };
              }
            }

            if (Object.keys(connectionData).length > 0) {
              await this.enrollmentsRepository.update(
                existing.id,
                connectionData,
                tx,
              );
            }

            // 이미 존재하는 주소록(Enrollment)이면 ID 사용
            // 정보 업데이트가 필요한 경우 여기서 할 수도 있으나,
            // 현재 요구사항은 "기존 주소록에 있으면 그걸 쓴다"임.
            pendingLectureEnrollments.push({
              lectureId: lecture.id,
              enrollmentId: existing.id,
              ...(enrollmentReq.registeredAt
                ? { registeredAt: enrollmentReq.registeredAt }
                : {}),
            });
          } else {
            const [studentId, parentLinkId] = await Promise.all([
              resolveStudentId(enrollmentReq),
              resolveParentLinkId(enrollmentReq),
            ]);

            // 없으면 새로 생성할 목록에 추가
            newEnrollmentsData.push({
              instructorId,
              studentName: enrollmentReq.studentName,
              studentPhone: enrollmentReq.studentPhone,
              school: enrollmentReq.school,
              schoolYear: enrollmentReq.schoolYear,
              parentPhone: enrollmentReq.parentPhone,
              appStudentId: studentId,
              appParentLinkId: parentLinkId,
              status: EnrollmentStatus.ACTIVE,
            });
            pendingNewLectureEnrollments.push(enrollmentReq);
          }
        }

        // 4-2. 새 Enrollment 일괄 생성
        if (newEnrollmentsData.length > 0) {
          const createdEnrollments =
            await this.enrollmentsRepository.createMany(newEnrollmentsData, tx);
          const createdEnrollmentByPhone = new Map(
            createdEnrollments.map(
              (e: { id: string; studentPhone: string }) => [
                e.studentPhone,
                e.id,
              ],
            ),
          );

          pendingLectureEnrollments.push(
            ...pendingNewLectureEnrollments.map((enrollmentReq) => ({
              lectureId: lecture.id,
              enrollmentId: createdEnrollmentByPhone.get(
                enrollmentReq.studentPhone,
              )!,
              ...(enrollmentReq.registeredAt
                ? { registeredAt: enrollmentReq.registeredAt }
                : {}),
            })),
          );
        }

        // 4-3. LectureEnrollment 생성 (강의와 학생 연결)
        lectureEnrollments = await this.lectureEnrollmentsRepository.createMany(
          pendingLectureEnrollments,
          tx,
        );
      }

      return { ...lecture, lectureEnrollments };
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
      schoolYear: lecture.schoolYear,
      status: lecture.status,
      startAt: lecture.startAt,
      createdAt: lecture.createdAt,
      updatedAt: lecture.updatedAt ?? lecture.createdAt, // fallback to createdAt if updatedAt is null
      instructorName: lecture.instructor.user.name,
      enrollmentsCount: lecture._count.lectureEnrollments,
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
  ): Promise<LectureDetailResponse> {
    const lecture = await this.lecturesRepository.findById(id);

    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    return {
      id: lecture.id,
      title: lecture.title,
      subject: lecture.subject,
      schoolYear: lecture.schoolYear,
      status: lecture.status,
      startAt: lecture.startAt,
      createdAt: lecture.createdAt,
      updatedAt: lecture.updatedAt ?? lecture.createdAt, // fallback to createdAt if updatedAt is null
      instructorName: lecture.instructor.user.name,
      enrollmentsCount: lecture._count.lectureEnrollments,
      lectureTimes: lecture.lectureTimes.map((lt) => ({
        day: lt.day,
        startTime: lt.startTime,
        endTime: lt.endTime,
      })),
      // LectureEnrollment를 통해 학생 정보를 평탄화하여 반환
      students: lecture.lectureEnrollments.map((le) => ({
        id: le.enrollment.id,
        lectureEnrollmentId: le.id,
        lectureEnrollmentMemo: le.memo,
        name: le.enrollment.studentName,
        school: `${le.enrollment.school} ${le.enrollment.schoolYear}`,
        phone: le.enrollment.studentPhone,
        parentPhone: le.enrollment.parentPhone,
      })),
      exams: lecture.exams.map((exam) => ({
        id: exam.id,
        title: exam.title,
        status: 'PENDING', // 스키마에 필드 없음
        questionCount: exam._count.questions,
      })),
    };
  }

  /** 강의 수정 */
  async updateLecture(
    profileId: string,
    userType: UserType,
    id: string,
    data: UpdateLectureDto,
  ): Promise<LectureWithTimes> {
    const lecture = await this.lecturesRepository.findById(id);

    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // lectureTimes 필드 분리
    const { lectureTimes, ...lectureData } = data;

    // undefined를 제외한 필드만 추출
    const updatePayload = Object.fromEntries(
      Object.entries(lectureData).filter(([_, value]) => value !== undefined),
    );

    return await this.lecturesRepository.update(
      id,
      lecture.instructorId,
      updatePayload,
      lectureTimes,
    );
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

  /** 단순 강의 리스트 조회 (드롭다운 용) */
  async getLectureSimpleList(
    instructorId: string,
  ): Promise<{ id: string; title: string; status: string }[]> {
    const lectures = await this.lecturesRepository.findSimpleMany(instructorId);
    return lectures.map((lecture) => ({
      id: lecture.id,
      title: lecture.title,
      status: lecture.status,
    }));
  }
}
