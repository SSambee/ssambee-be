import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { GradesRepository } from '../repos/grades.repo.js';
import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { PermissionService } from './permission.service.js';
import { calculateAttendanceStats } from '../utils/attendance.util.js';
import {
  toZonedTime,
  format,
  KST_TIMEZONE,
  toKstIsoString,
} from '../utils/date.util.js';
import { ForbiddenException } from '../err/http.exception.js';
import { DashboardRepository } from '../repos/dashboard.repo.js';

export interface DashboardData {
  today: string; // 2026.02.04
  clinicsCount: number;
  attendanceRate: number;
  latestExam: {
    title: string;
    rank: number;
    totalParticipants: number;
    score: number;
  } | null;
  announcements: {
    id: string;
    title: string;
    createdAt: string | null;
  }[];
  todaySchedule: {
    lectureTitle: string;
    lectureTime: string; // startTime ~ endTime
  }[];
  academicAchievement: {
    month: string; // "2024.01"
    score: number;
  }[];
  recentExams: {
    id: string;
    title: string;
    score: number;
    examDate: string | null;
  }[];
  resolvedChildLinkId?: string; // 학부모인 경우 선택된 자녀 링크 ID
}

export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly permissionService: PermissionService,
    private readonly gradesRepo: GradesRepository,
    private readonly instructorPostsRepo: InstructorPostsRepository,
    private readonly lectureEnrollmentsRepo: LectureEnrollmentsRepository,
    private readonly enrollmentsRepo: EnrollmentsRepository,
    private readonly prisma: PrismaClient,
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

  /**
   * 학생 대시보드 조회
   *
   * [하이브리드 방식 설명]
   * - instructorId가 없으면: 학생이 수강 중인 모든 강사/학원의 데이터를 통합(Aggregated)하여 반환합니다.
   * - instructorId가 있으면: 해당 강사의 데이터만 필터링하여 반환합니다.
   * - 만약 특정 학원별 보기로 고정하고 싶다면, 컨트롤러에서 instructorId를 필수로 받도록 validation을 수정하고,
   *   아래 로직에서 instructorId 필터링을 강제하면 됩니다.
   */
  async getSvcDashboard(
    userType: UserType,
    profileId: string,
    childLinkId?: string,
    instructorId?: string,
  ): Promise<DashboardData> {
    let enrollmentIds: string[] = [];
    let resolvedChildLinkId: string | undefined;

    // 1. 기초 권한 확인 및 Enrollment ID 목록 확보
    if (userType === UserType.STUDENT) {
      const enrollments =
        await this.enrollmentsRepo.findManyByAppStudentId(profileId);

      // instructorId 필터가 있다면 해당 강사의 enrollment만 선택 및 권한 확인
      if (
        instructorId &&
        !enrollments.some((e) => e.instructorId === instructorId)
      ) {
        throw new ForbiddenException('해당 강사의 수강 정보가 없습니다.');
      }

      enrollmentIds = enrollments
        .filter((e) => !instructorId || e.instructorId === instructorId)
        .map((e) => e.id);
    } else if (userType === UserType.PARENT) {
      if (!childLinkId) {
        const childLinks =
          await this.permissionService.getChildLinks(profileId);
        if (!childLinks || childLinks.length === 0) {
          return this.getEmptyDashboard();
        }
        childLinkId = childLinks[0].id;
      } else {
        await this.permissionService.validateChildAccess(
          userType,
          profileId,
          childLinkId,
        );
      }
      resolvedChildLinkId = childLinkId;

      const enrollments = await this.enrollmentsRepo.findManyByAppParentLinkIds(
        [childLinkId],
      );

      if (
        instructorId &&
        !enrollments.some((e) => e.instructorId === instructorId)
      ) {
        throw new ForbiddenException('해당 강사의 수강 정보가 없습니다.');
      }

      enrollmentIds = enrollments
        .filter((e) => !instructorId || e.instructorId === instructorId)
        .map((e) => e.id);
    } else {
      throw new ForbiddenException('학생 또는 학부모만 접근 가능합니다.');
    }

    if (enrollmentIds.length === 0) {
      return this.getEmptyDashboard(resolvedChildLinkId);
    }

    // 2. 관련 LectureEnrollment 및 ID 추출 (Soft Delete 필터링 포함)
    const lectureEnrollments =
      await this.lectureEnrollmentsRepo.findManyByEnrollmentIds(enrollmentIds);
    const activeLectureEnrollments = lectureEnrollments.filter(
      (le) => le.lecture.deletedAt === null,
    );

    if (activeLectureEnrollments.length === 0) {
      return this.getEmptyDashboard(resolvedChildLinkId);
    }

    const leIds = activeLectureEnrollments.map((le) => le.id);
    const lectureIds = [
      ...new Set(activeLectureEnrollments.map((le) => le.lectureId)),
    ];

    // 3. 병렬 데이터 페칭 (성능 최적화 및 Aggregation)
    const [clinics, attendances, allGrades, announcementsRaw] =
      await Promise.all([
        // 1) Clinics (PENDING 상태인 클리닉이 있는 과목 수)
        this.prisma.clinic.groupBy({
          by: ['lectureId'],
          where: {
            lectureEnrollmentId: { in: leIds },
            status: 'PENDING',
            lecture: { deletedAt: null },
          },
        }),
        // 2) Attendances (출석 데이터 - 최근 90일 통계용)
        this.prisma.attendance.findMany({
          where: {
            lectureEnrollmentId: { in: leIds },
            lecture: { deletedAt: null },
            createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { date: 'desc' },
          take: 1000,
        }),
        // 3) Grades (최근 성적 데이터 50개)
        this.prisma.grade.findMany({
          where: {
            lectureEnrollmentId: { in: leIds },
            exam: { lecture: { deletedAt: null } },
          },
          include: {
            exam: true,
          },
          orderBy: {
            exam: { examDate: 'desc' },
          },
          take: 50,
        }),
        // 4) Announcements (최근 공지사항 3개 - SELECTED 스코프 중 해당 학생이 타겟으로 지정된 공지만)
        this.instructorPostsRepo.findMany({
          page: 1,
          limit: 3,
          targetEnrollmentIds: enrollmentIds,
        }),
      ]);

    // 4. 데이터 가공
    const clinicsCount = clinics.length;
    const stats = calculateAttendanceStats(attendances);
    const attendanceRate = stats.attendanceRate;

    // 최신 시험 정보 (안전한 접근)
    const latestGrade =
      allGrades.length > 0
        ? allGrades.find((g) => g.exam.examDate !== null) || allGrades[0]
        : null;

    let latestExamInfo = null;
    if (latestGrade) {
      const [totalParticipants, rank] = await Promise.all([
        this.prisma.grade.count({ where: { examId: latestGrade.examId } }),
        this.gradesRepo.calculateRankByExamId(
          latestGrade.examId,
          latestGrade.score,
        ),
      ]);
      latestExamInfo = {
        title: latestGrade.exam.title,
        rank,
        totalParticipants,
        score: latestGrade.score,
      };
    }

    const announcements = announcementsRaw.posts.map((p) => ({
      id: p.id,
      title: p.title,
      createdAt: toKstIsoString(p.createdAt),
    }));

    // 5. Today's Schedule (오늘의 수업 시간표)
    const now = new Date();
    const kstNow = toZonedTime(now, KST_TIMEZONE);
    const todayStr = format(kstNow, 'yyyy.MM.dd', { timeZone: KST_TIMEZONE });
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const todayDayName = dayNames[kstNow.getDay()];

    const todayLectures = await this.prisma.lectureTime.findMany({
      where: {
        lectureId: { in: lectureIds },
        day: todayDayName,
        lecture: { deletedAt: null },
      },
      include: {
        lecture: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });
    const todaySchedule = todayLectures.map((tl) => ({
      lectureTitle: tl.lecture.title,
      lectureTime: `${tl.startTime} ~ ${tl.endTime}`,
    }));

    // 6. Recent Exams & Academic Achievement (최근 10개 시험 및 월간 통계)
    const recentExams = allGrades.slice(0, 10).map((g) => ({
      id: g.exam.id,
      title: g.exam.title,
      score: g.score,
      examDate: g.exam.examDate
        ? format(toZonedTime(g.exam.examDate, KST_TIMEZONE), 'yyyy.MM.dd', {
            timeZone: KST_TIMEZONE,
          })
        : null,
    }));

    const monthlyScoresMap = new Map<
      string,
      { total: number; count: number }
    >();
    allGrades.forEach((g) => {
      if (!g.exam.examDate) return;
      const kstDate = toZonedTime(g.exam.examDate, KST_TIMEZONE);
      const monthKey = format(kstDate, 'yyyy.MM', { timeZone: KST_TIMEZONE });
      const current = monthlyScoresMap.get(monthKey) || { total: 0, count: 0 };
      monthlyScoresMap.set(monthKey, {
        total: current.total + g.score,
        count: current.count + 1,
      });
    });

    const academicAchievement = Array.from(monthlyScoresMap.entries())
      .map(([month, data]) => ({
        month,
        score: Math.round(data.total / data.count),
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);

    return {
      today: todayStr,
      clinicsCount,
      attendanceRate,
      latestExam: latestExamInfo,
      announcements,
      todaySchedule,
      academicAchievement,
      recentExams,
      resolvedChildLinkId,
    };
  }

  private getEmptyDashboard(resolvedChildLinkId?: string): DashboardData {
    const now = new Date();
    const kstNow = toZonedTime(now, KST_TIMEZONE);
    const todayStr = format(kstNow, 'yyyy.MM.dd', { timeZone: KST_TIMEZONE });

    return {
      today: todayStr,
      clinicsCount: 0,
      attendanceRate: 0,
      latestExam: null,
      announcements: [],
      todaySchedule: [],
      academicAchievement: [],
      recentExams: [],
      resolvedChildLinkId,
    };
  }
}
