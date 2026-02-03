import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { EnrollmentStatus } from '../constants/enrollments.constant.js';
import {
  NotFoundException,
  ForbiddenException,
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
} from '../validations/enrollments.validation.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

/** 수강생 목록 항목 (출결 1건 포함) */
export type EnrollmentWithAttendance = Omit<
  Awaited<ReturnType<EnrollmentsRepository['findManyByLectureId']>>[number],
  'attendances' | 'lectureEnrollments'
> & {
  attendance:
    | Awaited<
        ReturnType<EnrollmentsRepository['findManyByLectureId']>
      >[number]['attendances'][number]
    | null;
  lectureEnrollmentId?: string;
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
          enrollmentId = existingEnrollments[0].id;
        }
      }

      // 4. 없으면 새로 생성
      if (!enrollmentId) {
        let parentLinkId = data.appParentLinkId;
        if (!parentLinkId && data.studentPhone) {
          const link = await this.parentsService.findLinkByPhoneNumber(
            data.studentPhone,
          );
          if (link) {
            parentLinkId = link.id;
          }
        }

        let studentId = data.appStudentId;
        if (!studentId && data.studentPhone) {
          const student = await this.studentRepository.findByPhoneNumber(
            data.studentPhone,
          );
          if (student) {
            studentId = student.id;
          }
        }

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

      // 5. LectureEnrollment 생성 (강의와 학생 연결)
      const lectureEnrollment = await this.lectureEnrollmentsRepository.create(
        {
          lectureId,
          enrollmentId: enrollmentId!,
        },
        tx,
      );

      return lectureEnrollment;
    });
  }

  /** 수강생 목록 조회 (강사/조교) - 통합됨 */
  async getEnrollments(
    userType: UserType,
    profileId: string,
    query: GetEnrollmentsQueryDto,
  ): Promise<EnrollmentListResponse> {
    // 1. 권한 체크 및 대상 강사 ID 확인
    let targetInstructorId = '';

    if (query.lecture) {
      // 강의가 있으면 해당 강의의 담당 강사 확인 및 접근 권한 체크 필요
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

      // Repository 호출 (강의별 조회)
      const enrollmentsRaw =
        await this.enrollmentsRepository.findManyByLectureId(query.lecture, {
          examId: query.examId,
        });

      const enrollments = enrollmentsRaw.map((e) => {
        const { attendances, lectureEnrollments, ...rest } = e;
        return {
          ...rest,
          attendance: attendances?.[0] || null,
          lectureEnrollmentId: lectureEnrollments?.[0]?.id,
          lectureEnrollments: lectureEnrollments,
        } as EnrollmentWithAttendance;
      });

      return {
        enrollments,
        totalCount: enrollments.length,
      };
    } else {
      // 강의 지정 없으면 전체 목록 조회
      targetInstructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );

      const result = await this.enrollmentsRepository.findManyByInstructorId(
        targetInstructorId,
        query,
      );

      return {
        ...result,
        enrollments: result.enrollments.map((e) => {
          const { attendances, ...rest } = e;
          return {
            ...rest,
            attendance: attendances?.[0] || null,
          } as EnrollmentWithAttendance;
        }),
      };
    }
  }

  /** Enrollment 상세 조회 (권한 체크 포함) */
  async getEnrollmentDetail(
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

    const { enrollmentId } = lectureEnrollment;

    // 2. Enrollment 및 Lecture 정보 조회
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
    const lectures = enrollment.lectureEnrollments.map((le) => ({
      ...le.lecture,
      lectureEnrollmentId: le.id, // 매핑 정보도 알면 좋음
      registeredAt: le.registeredAt,
    }));

    return {
      ...enrollment,
      lectureEnrollments: undefined, // 원본 제거
      lectures,
    };
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

    return await this.enrollmentsRepository.update(id, data);
  }

  /** 학생/학부모용 수강 목록 조회 (강의 기반) */
  async getMyEnrollments(
    userType: UserType,
    profileId: string,
    query: GetSvcEnrollmentsQueryDto = {
      page: 1, // Default value from schema
      limit: 20, // Default value from schema
    },
  ) {
    if (userType !== UserType.STUDENT) {
      throw new ForbiddenException(
        '학생은 본인의 수강 목록만, 학부모는 자녀별 수강 목록 API를 각각 사용해 주세요.',
      );
    }

    const { page = 1, limit = 20 } = query;
    const offset = (page - 1) * limit;

    const { lectureEnrollments, totalCount } =
      await this.lectureEnrollmentsRepository.findManyByAppStudentId(
        profileId,
        { limit, offset },
      );

    return {
      enrollments: lectureEnrollments, // 프론트엔드 호환성을 위해 키 이름은 일단 유지 (API 명세 변경 시 수정)
      totalCount,
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
    // 기존 validateEnrollmentReadAccess는 Enrollment 객체를 받으므로,
    // 여기서 직접 체크하거나 helper를 수정해야 함.
    // 일단 직접 체크 구현:
    if (userType === UserType.STUDENT) {
      if (lectureEnrollment.enrollment.appStudentId !== profileId) {
        throw new ForbiddenException('본인의 수강 정보만 조회할 수 있습니다.');
      }
    } else if (userType === UserType.PARENT) {
      if (lectureEnrollment.enrollment.appParentLinkId === null) {
        // 연동 안된 경우
        throw new ForbiddenException('자녀의 수강 정보만 조회할 수 있습니다.');
      }
      // 부모 ID -> Link -> 검증 로직이 복잡하므로 PermissionService 위임 권장하나
      // 여기서는 Enrollment 객체를 통해 간접 검증 가능
      // (단, lectureEnrollment.enrollment에는 appParentLinkId만 있음)
      // ParentsService를 통해 profileId가 해당 appParentLinkId를 소유하는지 확인 필요.
      // 하지만 현재 ParentsService.validateParentLinkAccess 같은게 없다면?
      // 일단 기존 로직처럼 validateEnrollmentReadAccess 재활용 시도
    }

    // PermissionService 재활용을 위해 Enrollment 객체 형태 맞춤 (최소한의 필드)
    await this.permissionService.validateEnrollmentReadAccess(
      lectureEnrollment.enrollment,
      userType,
      profileId,
    );

    return lectureEnrollment;
  }
}
