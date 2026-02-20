import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { ClinicsRepository } from '../repos/clinics.repo.js';
import { AttendancesRepository } from '../repos/attendances.repo.js';
import { GradesRepository } from '../repos/grades.repo.js';
import { InstructorPostsRepository } from '../repos/instructor-posts.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { PermissionService } from './permission.service.js';
import { calculateAttendanceStats } from '../utils/attendance.util.js';
import { toZonedTime, format, KST_TIMEZONE, toKstIsoString } from '../utils/date.util.js';
import { ForbiddenException } from '../err/http.exception.js';

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
}

export class DashboardService {
  constructor(
    private readonly clinicsRepo: ClinicsRepository,
    private readonly attendancesRepo: AttendancesRepository,
    private readonly gradesRepo: GradesRepository,
    private readonly instructorPostsRepo: InstructorPostsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly lectureEnrollmentsRepo: LectureEnrollmentsRepository,
    private readonly enrollmentsRepo: EnrollmentsRepository,
    private readonly examsRepo: ExamsRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  async getDashboard(
    userType: UserType,
    profileId: string,
    childLinkId?: string,
  ): Promise<DashboardData> {
    let enrollmentIds: string[] = [];

    if (userType === UserType.STUDENT) {
      const { enrollments } = await this.enrollmentsRepo.findByAppStudentId(
        profileId,
        { limit: 1000 },
      );
      enrollmentIds = enrollments.map((e) => e.id);
    } else if (userType === UserType.PARENT) {
      if (!childLinkId) {
        const childLinks = await this.permissionService.getChildLinks(profileId);
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

      const enrollments = await this.enrollmentsRepo.findManyByAppParentLinkIds([
        childLinkId,
      ]);
      enrollmentIds = enrollments.map((e) => e.id);
    } else {
      throw new ForbiddenException('학생 또는 학부모만 접근 가능합니다.');
    }

    if (enrollmentIds.length === 0) {
      return this.getEmptyDashboard();
    }

    const lectureEnrollments = await this.lectureEnrollmentsRepo.findManyByEnrollmentIds(enrollmentIds);
    const leIds = lectureEnrollments.map(le => le.id);
    const lectureIds = [...new Set(lectureEnrollments.map(le => le.lectureId))];
    const instructorIds = [...new Set(lectureEnrollments.map(le => le.lecture.instructorId))];

    // 병렬 데이터 페칭
    const [clinics, attendances, allGrades, announcementsRaw] = await Promise.all([
      // 1. Clinics (PENDING 상태인 클리닉이 있는 과목 수)
      this.prisma.clinic.findMany({
        where: {
          lectureEnrollmentId: { in: leIds },
          status: 'PENDING',
          lecture: { deletedAt: null },
        },
        select: { lectureId: true },
      }),
      // 2. Attendances (출석 데이터)
      this.prisma.attendance.findMany({
        where: {
          lectureEnrollmentId: { in: leIds },
          lecture: { deletedAt: null },
        },
      }),
      // 3. Grades (성적 데이터 - 석차 및 학업 성취도용)
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
      }),
      // 4. Announcements (최근 공지사항 3개)
      this.instructorPostsRepo.findMany({
        page: 1,
        limit: 3,
        studentFiltering: {
          lectureIds,
          instructorIds,
          enrollmentIds,
        },
      }),
    ]);

    const pendingClinicLectureIds = new Set(clinics.map(c => c.lectureId));
    const clinicsCount = pendingClinicLectureIds.size;

    const stats = calculateAttendanceStats(attendances);
    const attendanceRate = stats.attendanceRate;

    // 최신 시험 정보 (시험일이 있는 것 중 가장 최근)
    const latestGrade = allGrades.find(g => g.exam.examDate !== null) || allGrades[0] || null;
    let latestExamInfo = null;
    if (latestGrade) {
      const [totalParticipants, rank] = await Promise.all([
        this.prisma.grade.count({ where: { examId: latestGrade.examId } }),
        this.gradesRepo.calculateRankByExamId(latestGrade.examId, latestGrade.score),
      ]);
      latestExamInfo = {
        title: latestGrade.exam.title,
        rank,
        totalParticipants,
        score: latestGrade.score,
      };
    }

    const announcements = announcementsRaw.posts.map(p => ({
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
      },
      include: {
        lecture: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });
    const todaySchedule = todayLectures.map(tl => ({
      lectureTitle: tl.lecture.title,
      lectureTime: `${tl.startTime} ~ ${tl.endTime}`,
    }));

    // 6. Recent Exams & Academic Achievement (최근 시험 결과 및 월간 학업 성취도)
    const recentExams = allGrades.slice(0, 10).map(g => ({
      id: g.exam.id,
      title: g.exam.title,
      score: g.score,
      examDate: g.exam.examDate ? format(toZonedTime(g.exam.examDate, KST_TIMEZONE), 'yyyy.MM.dd', { timeZone: KST_TIMEZONE }) : null,
    }));

    const monthlyScoresMap = new Map<string, { total: number; count: number }>();
    allGrades.forEach(g => {
        if (!g.exam.examDate) return;
        const kstDate = toZonedTime(g.exam.examDate, KST_TIMEZONE);
        const monthKey = format(kstDate, 'yyyy.MM', { timeZone: KST_TIMEZONE });
        const current = monthlyScoresMap.get(monthKey) || { total: 0, count: 0 };
        monthlyScoresMap.set(monthKey, {
            total: current.total + g.score,
            count: current.count + 1
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
    };
  }

  private getEmptyDashboard(): DashboardData {
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
    };
  }
}
