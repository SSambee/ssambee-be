import { PrismaClient } from '../generated/prisma/client.js';
import type { Attendance, Enrollment } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { LectureStatus } from '../constants/lectures.constant.js';
import {
  BadRequestException,
  NotFoundException,
} from '../err/http.exception.js';
import { AttendancesRepository } from '../repos/attendances.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { ParentsService } from './parents.service.js';
import { PermissionService } from './permission.service.js';
import type {
  CreateAttendanceDto,
  CreateBulkAttendancesDto,
} from '../validations/attendances.validation.js';
import {
  calculateAttendanceStats,
  AttendanceStats,
} from '../utils/attendance.util.js';

export class AttendancesService {
  constructor(
    private readonly attendancesRepository: AttendancesRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly assistantRepository: AssistantRepository,
    private readonly parentsService: ParentsService,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 강의 내 단체 출결 등록 (Transaction + Upsert Loop) */
  async createBulkAttendances(
    lectureId: string,
    data: CreateBulkAttendancesDto, // DTO 구조 변경 반영
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의 확인
    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    // 2. 권한 확인 (강사/조교)
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    return await this.prisma.$transaction(async (tx) => {
      const currentLecture = await this.lecturesRepository.findById(
        lectureId,
        tx,
      );
      if (!currentLecture) {
        throw new NotFoundException('강의를 찾을 수 없습니다.');
      }

      this.validateAttendanceWritableLecture(currentLecture.status);

      // tx 안에서 최신 수강생 목록을 기준으로 검증하고 출결을 저장한다.
      const validLectureEnrollments =
        await this.lectureEnrollmentsRepository.findManyByLectureIdWithEnrollments(
          lectureId,
          tx,
        );

      const lectureEnrollmentMap = new Map(
        validLectureEnrollments.map((le) => [le.enrollmentId, le]),
      );

      const results = [];
      for (const item of data.attendances) {
        const lectureEnrollment = lectureEnrollmentMap.get(item.enrollmentId);

        if (!lectureEnrollment) {
          throw new NotFoundException(
            `수강 정보(ID: ${item.enrollmentId})가 해당 강의에 존재하지 않습니다.`,
          );
        }

        // Upsert
        const result = await this.attendancesRepository.upsert(
          {
            lectureEnrollmentId_date: {
              lectureEnrollmentId: lectureEnrollment.id,
              date: data.date,
            },
          },
          {
            lectureId,
            enrollmentId: item.enrollmentId,
            lectureEnrollmentId: lectureEnrollment.id,
            date: data.date,
            status: item.status,
            enterTime: item.enterTime ? new Date(item.enterTime) : null,
            leaveTime: item.leaveTime ? new Date(item.leaveTime) : null,
            memo: item.memo,
          },
          {
            status: item.status,
            enterTime: item.enterTime ? new Date(item.enterTime) : undefined,
            leaveTime: item.leaveTime ? new Date(item.leaveTime) : undefined,
            memo: item.memo,
          },
          tx,
        );
        results.push(result);
      }
      return results;
    });
  }

  /** 단일 수강생 출결 등록 (Upsert) */
  async createAttendance(
    lectureId: string,
    enrollmentId: string,
    data: CreateAttendanceDto,
    userType: UserType,
    profileId: string,
  ) {
    const lecture = await this.lecturesRepository.findById(lectureId);
    if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    return await this.prisma.$transaction(async (tx) => {
      const currentLecture = await this.lecturesRepository.findById(
        lectureId,
        tx,
      );
      if (!currentLecture) {
        throw new NotFoundException('강의를 찾을 수 없습니다.');
      }

      this.validateAttendanceWritableLecture(currentLecture.status);

      const lectureEnrollment =
        await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
          lectureId,
          enrollmentId,
          tx,
        );

      if (!lectureEnrollment) {
        throw new NotFoundException('해당 강의의 수강생이 아닙니다.');
      }

      return await this.attendancesRepository.upsert(
        {
          lectureEnrollmentId_date: {
            lectureEnrollmentId: lectureEnrollment.id,
            date: data.date,
          },
        },
        {
          lectureId,
          enrollmentId,
          lectureEnrollmentId: lectureEnrollment.id,
          date: data.date,
          status: data.status,
          enterTime: data.enterTime ? new Date(data.enterTime) : null,
          leaveTime: data.leaveTime ? new Date(data.leaveTime) : null,
          memo: data.memo,
        },
        {
          status: data.status,
          enterTime: data.enterTime ? new Date(data.enterTime) : undefined,
          leaveTime: data.leaveTime ? new Date(data.leaveTime) : undefined,
          memo: data.memo,
        },
        tx,
      );
    });
  }

  /** 수강생 출결 조회 + 통계 (강의별) */
  async getAttendancesByLectureEnrollment(
    lectureId: string,
    enrollmentId: string,
    userType: UserType,
    profileId: string,
  ): Promise<{ attendances: Attendance[]; stats: AttendanceStats }> {
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findByLectureIdAndEnrollmentId(
        lectureId,
        enrollmentId,
      );

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 권한 확인: 여기서는 Enrollment(관계)에 대한 권한 체크를 재사용
    await this.validateReadAccess(
      lectureEnrollment.enrollment,
      userType,
      profileId,
    );

    const attendances =
      await this.attendancesRepository.findByLectureEnrollmentId(
        lectureEnrollment.id,
      );
    const stats = calculateAttendanceStats(attendances);

    return { attendances, stats };
  }

  /** 출결 삭제 */
  async deleteAttendance(
    attendanceId: string,
    userType: UserType,
    profileId: string,
  ): Promise<void> {
    const attendance = await this.attendancesRepository.findById(attendanceId);
    if (!attendance) {
      throw new NotFoundException('출결 정보를 찾을 수 없습니다.');
    }

    const lecture = await this.lecturesRepository.findById(
      attendance.lectureId,
    );
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }

    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    await this.prisma.$transaction(async (tx) => {
      const currentAttendance = await this.attendancesRepository.findById(
        attendanceId,
        tx,
      );
      if (!currentAttendance) {
        throw new NotFoundException('출결 정보를 찾을 수 없습니다.');
      }

      const currentLecture = await this.lecturesRepository.findById(
        currentAttendance.lectureId,
        tx,
      );
      if (!currentLecture) {
        throw new NotFoundException('강의를 찾을 수 없습니다.');
      }

      this.validateAttendanceWritableLecture(currentLecture.status);

      await this.attendancesRepository.delete(attendanceId, tx);
    });
  }

  /** Helper Functions */

  /** 조회 권한 체크 (강사/조교/학생/학부모) */
  private async validateReadAccess(
    enrollment: Enrollment,
    userType: UserType,
    profileId: string,
  ) {
    await this.permissionService.validateEnrollmentReadAccess(
      enrollment,
      userType,
      profileId,
    );
  }

  private validateAttendanceWritableLecture(status: string) {
    if (status !== LectureStatus.IN_PROGRESS) {
      throw new BadRequestException(
        '출결은 진행 중인 강의에서만 등록할 수 있습니다.',
      );
    }
  }
}
