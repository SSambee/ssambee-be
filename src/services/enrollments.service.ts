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
  lectureEnrollments?: Awaited<
    ReturnType<EnrollmentsRepository['findManyByLectureId']>
  >[number]['lectureEnrollments'];
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
        const { attendances, ...rest } = e;
        return {
          ...rest,
          attendance: attendances?.[0] || null,
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

  /** 학생/학부모용 수강 목록 조회 */
  async getMyEnrollments(
    userType: UserType,
    profileId: string,
    query?: GetSvcEnrollmentsQueryDto,
  ) {
    if (userType !== UserType.STUDENT) {
      throw new ForbiddenException(
        '학생은 본인의 수강 목록만, 학부모는 자녀별 수강 목록 API를 각각 사용해 주세요.',
      );
    }

    const { enrollments, totalCount } =
      await this.enrollmentsRepository.findByAppStudentId(profileId, query);

    return {
      enrollments,
      totalCount,
    };
  }

  /** 학생/학부모용 수강 상세 조회 */
  async getEnrollmentById(
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    const enrollment =
      await this.enrollmentsRepository.findByIdWithLectures(enrollmentId);

    if (!enrollment || enrollment.deletedAt) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 권한 체크 (학생/학부모 조회 권한)
    await this.permissionService.validateEnrollmentReadAccess(
      enrollment,
      userType,
      profileId,
    );

    // 응답 평탄화
    const lectures = enrollment.lectureEnrollments.map((le) => ({
      ...le.lecture,
      lectureEnrollmentId: le.id,
      registeredAt: le.registeredAt,
    }));

    return {
      ...enrollment,
      lectureEnrollments: undefined,
      lectures,
    };
  }
}
