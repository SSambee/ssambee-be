import { UserType } from '../constants/auth.constant.js';
import { KST_TIMEZONE, toKstIsoString } from '../utils/date.util.js';
import { PermissionService } from './permission.service.js';
import { DashboardRepository } from '../repos/dashboard.repo.js';

export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly permissionService: PermissionService,
  ) {}

  async getDashboard(userType: UserType, profileId: string) {
    const instructorId = await this.permissionService.getEffectiveInstructorId(
      userType,
      profileId,
    );

    const todayDay = new Intl.DateTimeFormat('ko-KR', {
      weekday: 'short',
      timeZone: KST_TIMEZONE,
    }).format(new Date());

    const last48HoursStartUtc = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [
      totalEnrollmentCount,
      inProgressLectureCount,
      scheduledLectureCount,
      ungradedExamCount,
      newEnrollmentsCount,
      ongoingLecturesToday,
      latestClinics,
    ] = await Promise.all([
      this.dashboardRepository.countActiveEnrollmentsByInstructor(instructorId),
      this.dashboardRepository.countInProgressLecturesByInstructor(
        instructorId,
      ),
      this.dashboardRepository.countScheduledLecturesByInstructor(instructorId),
      this.dashboardRepository.countUnfinishedExamsByInstructor(instructorId),
      this.dashboardRepository.countNewEnrollmentsByInstructorInLast48Hours(
        instructorId,
        last48HoursStartUtc,
      ),
      this.dashboardRepository.findTodayOngoingLecturesByInstructor(
        instructorId,
        todayDay,
      ),
      this.dashboardRepository.findLatestClinicsByInstructor(instructorId),
    ]);

    const flattenedOngoingLectures = ongoingLecturesToday.flatMap((lecture) =>
      lecture.lectureTimes.map((lectureTime) => ({
        lectureName: lecture.title,
        startTime: lectureTime.startTime,
        endTime: lectureTime.endTime,
        day: lectureTime.day,
      })),
    );

    const flattenedLatestClinics = latestClinics.map((clinic) => ({
      studentName: clinic.lectureEnrollment?.enrollment.studentName ?? null,
      examTitle: clinic.exam.title,
      clinicName: clinic.title,
      createdAt: toKstIsoString(clinic.createdAt),
      deadline: clinic.deadline ? toKstIsoString(clinic.deadline) : null,
      status: clinic.status,
    }));

    return {
      totalEnrollmentCount,
      inProgressLectureCount,
      scheduledLectureCount,
      ungradedExamCount,
      newEnrollmentsCount,
      ongoingLecturesToday: flattenedOngoingLectures,
      latestClinics: flattenedLatestClinics,
    };
  }
}
