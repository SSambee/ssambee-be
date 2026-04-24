import { PrismaClient, Lecture } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import {
  EnrollmentLectureFilter,
  EnrollmentStatus,
} from '../constants/enrollments.constant.js';
import { LectureStatus } from '../constants/lectures.constant.js';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '../err/http.exception.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { StudentRepository } from '../repos/student.repo.js';
import { ParentsService } from './parents.service.js';
import { PermissionService } from './permission.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  GetEnrollmentsQueryDto,
  GetSvcEnrollmentsQueryDto,
  CreateEnrollmentMigrationDto,
} from '../validations/enrollments.validation.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

/** 수강생 목록 항목 (출결 1건 포함) */
export type EnrollmentWithAttendance = Omit<
  Awaited<ReturnType<EnrollmentsRepository['findMany']>>['enrollments'][number],
  'attendances' | 'lectureEnrollments'
> & {
  attendance:
    | Awaited<
        ReturnType<EnrollmentsRepository['findMany']>
      >['enrollments'][number]['attendances'][number]
    | null;
  lecture?: Lecture | null;
};

export type EnrollmentWithAttendances = Omit<
  Awaited<ReturnType<EnrollmentsRepository['findMany']>>['enrollments'][number],
  'attendances' | 'lectureEnrollments'
> & {
  attendances?: Awaited<
    ReturnType<EnrollmentsRepository['findMany']>
  >['enrollments'][number]['attendances'];
  lectureEnrollments?: Awaited<
    ReturnType<EnrollmentsRepository['findMany']>
  >['enrollments'][number]['lectureEnrollments'];
};

/** 수강생 목록 조회 결과 */
export interface EnrollmentListResponse {
  enrollments: EnrollmentWithAttendance[];
  totalCount: number;
}

export class EnrollmentsService {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly studentRepository: StudentRepository,
    private readonly parentsService: ParentsService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** Enrollment 생성 */
  async createEnrollment(
    lectureId: string,
    data: Prisma.EnrollmentUncheckedCreateInput,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 존재 여부 확인
    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 체크 (강사 본인 또는 담당 조교)
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    return await this.prisma.$transaction(async (tx) => {
      const resolveStudentId = async () => {
        let studentId = data.appStudentId;

        if (!studentId && data.studentPhone) {
          const studentPhone = data.studentPhone as string;
          const parentPhone = data.parentPhone as string | undefined;

          if (parentPhone) {
            const student =
              await this.studentRepository.findByPhoneNumberAndParentPhoneNumber(
                studentPhone,
                parentPhone,
                tx,
              );
            if (student) {
              studentId = student.id;
            }
          }
        }

        return studentId;
      };

      const resolveParentLinkId = async () => {
        let parentLinkId = data.appParentLinkId;

        if (!parentLinkId && data.studentPhone) {
          const studentPhone = data.studentPhone as string;
          const parentPhone = data.parentPhone as string;

          if (parentPhone) {
            const link =
              await this.parentsService.findLinkByPhoneNumberAndParentPhoneNumber(
                studentPhone,
                parentPhone,
              );
            if (link) {
              parentLinkId = link.id;
            }
          }
        }

        return parentLinkId;
      };

      // 3. 기존 Enrollment 확인 (같은 강사, 같은 학생 번호)
      let enrollmentId: string | null = null;

      if (data.studentPhone) {
        const existingEnrollments =
          await this.enrollmentsRepository.findManyByInstructorAndPhones(
            lecture.instructorId,
            [data.studentPhone],
            tx,
          );

        if (existingEnrollments.length > 0) {
          const existingEnrollment = existingEnrollments[0];
          enrollmentId = existingEnrollment.id;
          const connectionData: Prisma.EnrollmentUpdateInput = {};

          if (!existingEnrollment.appStudentId) {
            const studentId = await resolveStudentId();
            if (studentId) {
              connectionData.appStudent = { connect: { id: studentId } };
            }
          }

          if (!existingEnrollment.appParentLinkId) {
            const parentLinkId = await resolveParentLinkId();
            if (parentLinkId) {
              connectionData.appParentLink = {
                connect: { id: parentLinkId },
              };
            }
          }

          if (Object.keys(connectionData).length > 0) {
            await this.enrollmentsRepository.update(
              existingEnrollment.id,
              connectionData,
              tx,
            );
          }
        }
      }

      // 4. 없으면 새로 생성
      if (!enrollmentId) {
        const parentLinkId = await resolveParentLinkId();
        const studentId = await resolveStudentId();

        const newEnrollment = await this.enrollmentsRepository.create(
          {
            ...data,
            instructorId: lecture.instructorId, // 강의의 담당 강사로 설정
            status: EnrollmentStatus.ACTIVE,
            appParentLinkId: parentLinkId, // 자동 연결된 ID 설정
            appStudentId: studentId, // 자동 연결된 ID 설정
          },
          tx,
        );
        enrollmentId = newEnrollment.id;
      }

      // 5. LectureEnrollment 생성 또는 조회 (강의와 학생 연결, 중복 방지)
      // 먼저 기존 LectureEnrollment 확인
      let lectureEnrollment =
        await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
          lectureId,
          enrollmentId!,
          tx,
        );

      // 없으면 새로 생성하고 다시 조회 (일관된 반환 타입을 위해)
      if (!lectureEnrollment) {
        await this.lectureEnrollmentsRepository.create(
          {
            lectureId,
            enrollmentId: enrollmentId!,
          },
          tx,
        );

        // 생성 후 enrollment 정보를 포함하여 다시 조회
        lectureEnrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
            lectureId,
            enrollmentId!,
            tx,
          );
      }

      return lectureEnrollment;
    });
  }

  /** 수강 마이그레이션 (기존 등록 학생들을 다른 강의로 일괄 등록) */
  async createEnrollmentMigration(
    lectureId: string,
    data: CreateEnrollmentMigrationDto,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 존재 여부 확인
    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 체크 (강사 본인 또는 담당 조교)
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    const { enrollmentIds, memo } = data;

    // 3. 이미 이 강의에 등록된 학생들(Enrollment) 필터링을 위해 기존 LectureEnrollment 조회
    const existingLectureEnrollments =
      await this.lectureEnrollmentsRepository.findManyByLectureId(lectureId);
    const existingEnrollmentIds = new Set(
      existingLectureEnrollments.map((le) => le.enrollmentId),
    );

    // 4. 아직 등록되지 않은 학생 ID들만 필터링
    const newEnrollmentIds = enrollmentIds.filter(
      (id) => !existingEnrollmentIds.has(id),
    );

    if (newEnrollmentIds.length === 0) {
      return { count: 0 };
    }

    // 5. 일괄 등록
    const result = await this.lectureEnrollmentsRepository.createMany(
      newEnrollmentIds.map((eid) => ({
        lectureId,
        enrollmentId: eid,
        memo,
      })),
    );

    return { count: result.length };
  }

  /** 수강생 목록 조회 (강사/조교) - 통합됨 */
  async getEnrollments(
    userType: UserType,
    profileId: string,
    query: GetEnrollmentsQueryDto,
  ): Promise<EnrollmentListResponse> {
    // 1. 권한 체크 및 대상 강사 ID 확인
    let targetInstructorId = '';
    const isUnassignedLectureFilter =
      query.lecture === EnrollmentLectureFilter.UNASSIGNED;

    // 2. 통합된 Repository 호출
    // 강의 지정 시: 해당 강의의 담당 강사를 targetInstructorId로 설정 및 권한 검증
    if (query.lecture && !isUnassignedLectureFilter) {
      const lecture = await this.lecturesRepository.findById(query.lecture);
      if (!lecture) {
        throw new NotFoundException('강의를 찾을 수 없습니다.');
      }
      targetInstructorId = lecture.instructorId;

      await this.permissionService.validateInstructorAccess(
        targetInstructorId,
        userType,
        profileId,
      );
    }
    // 강사 ID가 없으면(=관리자/조교 등) 권한 서비스에서 조회
    else if (!targetInstructorId) {
      targetInstructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );
    }

    const result = await this.enrollmentsRepository.findMany(
      targetInstructorId,
      {
        ...query,
        lectureId: isUnassignedLectureFilter ? undefined : query.lecture,
        lectureFilter: isUnassignedLectureFilter
          ? EnrollmentLectureFilter.UNASSIGNED
          : undefined,
      },
      // 여기 세 번째 인자(tx)는 선택적이므로 생략 가능, 또는 기존 코드 문맥상 필요없음
    );

    return {
      ...result,
      enrollments: result.enrollments.map((e) =>
        this.transformToEnrollmentWithAttendance(e),
      ),
    };
  }

  /** 강의별 수강생 목록 조회 (Controller에서 호출) */
  async getEnrollmentsByLectureId(
    lectureId: string,
    userType: UserType,
    profileId: string,
    query: GetEnrollmentsQueryDto,
  ): Promise<EnrollmentListResponse> {
    return this.getEnrollments(userType, profileId, {
      ...query,
      lecture: lectureId,
    });
  }

  /** Enrollment 상세 조회 (권한 체크 포함) - EnrollmentId 기준 */
  async getEnrollmentDetail(
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    const enrollment =
      await this.enrollmentsRepository.findByIdWithLectures(enrollmentId);

    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 권한 체크
    await this.permissionService.validateInstructorAccess(
      enrollment.instructorId,
      userType,
      profileId,
    );

    // 응답 평탄화: lectureEnrollments -> lectures
    const lectures = enrollment.lectureEnrollments
      .filter((le) => !le.lecture.deletedAt)
      .map((le) => ({
        ...le.lecture,
        lectureEnrollmentId: le.id, // 매핑 정보도 알면 좋음
        registeredAt: le.registeredAt,
      }));

    return {
      ...enrollment,
      instructorName: enrollment.instructor?.user?.name,
      instructorPhoneNumber: enrollment.instructor?.phoneNumber,
      instructor: undefined, // 원본 제거
      lectureEnrollments: undefined, // 원본 제거
      lectures,
    };
  }

  /** Enrollment 상세 조회 (권한 체크 포함) - LectureEnrollmentId 기준 */
  async getEnrollmentDetailByLectureEnrollmentId(
    lectureEnrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. LectureEnrollment ID로 Enrollment ID 조회
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findById(lectureEnrollmentId);
    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 2. 기존 상세 조회 호출
    return this.getEnrollmentDetail(
      lectureEnrollment.enrollmentId,
      userType,
      profileId,
    );
  }

  /** Enrollment 수정 */
  async updateEnrollment(
    id: string,
    data: Prisma.EnrollmentUpdateInput,
    userType: UserType,
    profileId: string,
  ) {
    const enrollment = await this.enrollmentsRepository.findById(id);
    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 권한 체크
    await this.permissionService.validateInstructorAccess(
      enrollment.instructorId,
      userType,
      profileId,
    );
    if (data.status) {
      data.deletedAt = data.status === 'DROPPED' ? new Date() : null;
    }
    if (
      data.studentPhone !== undefined ||
      data.studentName !== undefined ||
      data.parentPhone !== undefined
    ) {
      const studentPhone =
        (data.studentPhone as string | undefined) ?? enrollment.studentPhone;
      const parentPhone =
        (data.parentPhone as string | undefined) ?? enrollment.parentPhone;

      if (studentPhone && parentPhone) {
        const student =
          await this.studentRepository.findByPhoneNumberAndParentPhoneNumber(
            studentPhone,
            parentPhone,
          );
        if (student) {
          data.appStudent = { connect: { id: student.id } };
        }
      }
    }
    if (data.studentPhone || data.studentName || data.parentPhone) {
      const studentPhone =
        (data.studentPhone as string | undefined) ??
        enrollment.studentPhone ??
        undefined;
      const parentPhone =
        (data.parentPhone as string | undefined) ?? enrollment.parentPhone;

      if (studentPhone && parentPhone) {
        const parent =
          await this.parentsService.findLinkByPhoneNumberAndParentPhoneNumber(
            studentPhone,
            parentPhone,
          );
        if (parent) {
          data.appParentLink = { connect: { id: parent.id } };
        }
      }
    }

    return await this.enrollmentsRepository.update(id, data);
  }

  /** 학생용 강사 목록 조회 (Enrollment 기반) */
  async getMyEnrollments(
    userType: UserType,
    profileId: string,
    query: GetSvcEnrollmentsQueryDto = {
      page: 1,
      limit: 20,
    },
  ) {
    if (userType !== UserType.STUDENT) {
      throw new ForbiddenException(
        '학생만 이용 가능한 API입니다. 학부모는 자녀별 API를 사용해 주세요.',
      );
    }

    const { enrollments, totalCount } =
      await this.enrollmentsRepository.findByAppStudentId(profileId, query);

    // memo 필드 제외 처리
    const sanitizedEnrollments = enrollments.map(
      ({ memo: _memo, ...rest }) => ({
        ...rest,
      }),
    );

    return {
      enrollments: sanitizedEnrollments,
      totalCount,
    };
  }

  /** 학생용 특정 강사의 강의 목록 조회 */
  async getEnrollmentLectures(
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. Enrollment 존재 확인 및 권한 체크
    const enrollment = await this.enrollmentsRepository.findById(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    if (userType === UserType.STUDENT) {
      if (enrollment.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 수강 정보만 조회할 수 있습니다.');
      }
    } else {
      throw new ForbiddenException('학생만 이용 가능한 API입니다.');
    }

    // 2. 해당 Enrollment에 속한 강의 목록 조회
    const lectureEnrollments =
      await this.lectureEnrollmentsRepository.findManyByEnrollmentId(
        enrollmentId,
      );

    // soft-delete된 강의 제외
    const activeLectureEnrollments = lectureEnrollments.filter(
      (le) => le.lecture && le.lecture.deletedAt === null,
    );

    // memo 필드 제외 처리
    const sanitizedLectureEnrollments = activeLectureEnrollments.map(
      ({ memo: _memo, ...rest }) => ({
        ...rest,
      }),
    );

    return {
      lectureEnrollments: sanitizedLectureEnrollments,
    };
  }

  /** 학생/학부모용 수강 상세 조회 (강의 기반) */
  async getEnrollmentById(
    lectureEnrollmentId: string, // URL param은 enrollmentId이지만 의미는 lectureEnrollmentId
    userType: UserType,
    profileId: string,
  ) {
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findByIdWithDetails(
        lectureEnrollmentId,
      );

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 권한 체크 (학생/학부모 조회 권한)
    if (userType === UserType.STUDENT) {
      if (lectureEnrollment.enrollment.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 수강 정보만 조회할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      if (lectureEnrollment.enrollment.appParentLinkId === null) {
        throw new ForbiddenException('자녀의 수강 정보만 조회할 수 있습니다.');
      }
    }

    await this.permissionService.validateEnrollmentReadAccess(
      lectureEnrollment.enrollment,
      userType,
      profileId,
    );

    return lectureEnrollment;
  }

  /** 강의 수강 삭제 (Hard Delete) */
  async removeLectureEnrollment(
    lectureId: string,
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 존재 여부 확인
    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 체크
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 3. LectureEnrollment 존재 여부 확인
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
        lectureId,
        enrollmentId,
      );

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    const isDeletable =
      lecture.status === LectureStatus.SCHEDULED ||
      !lecture.startAt ||
      new Date(lecture.startAt) > new Date();

    if (!isDeletable) {
      throw new BadRequestException(
        '이미 시작되었거나 예정되지 않은 강의의 수강 정보는 삭제할 수 없습니다.',
      );
    }

    // 4. 삭제 수행 (Hard Delete)
    await this.lectureEnrollmentsRepository.removeByLectureIdAndEnrollmentId(
      lectureId,
      enrollmentId,
    );

    return { lectureId, enrollmentId };
  }

  private transformToEnrollmentWithAttendance(
    enrollment: EnrollmentWithAttendances,
  ): EnrollmentWithAttendance {
    const { attendances, lectureEnrollments, ...rest } = enrollment;
    const visibleLectureEnrollments =
      lectureEnrollments?.filter((le) => !le.lecture?.deletedAt) ?? [];

    // 1. 진행중인 강의 우선 찾기 (Active & Not Ended)
    const now = new Date();
    let activeLecture = visibleLectureEnrollments.find(
      (le) =>
        le.lecture?.status === LectureStatus.IN_PROGRESS &&
        le.lecture?.endAt &&
        new Date(le.lecture.endAt) > now,
    )?.lecture;

    // 2. 없으면 가장 최근 강의 (Repo에서 registeredAt: desc 정렬됨)
    if (!activeLecture && visibleLectureEnrollments.length > 0) {
      activeLecture = visibleLectureEnrollments[0].lecture;
    }

    return {
      ...rest,
      attendance: attendances?.[0] || null,
      lecture: activeLecture || null,
    } as EnrollmentWithAttendance;
  }
}
