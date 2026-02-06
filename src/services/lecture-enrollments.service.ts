import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { NotFoundException } from '../err/http.exception.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { GradesRepository } from '../repos/grades.repo.js';
import { StatisticsRepository } from '../repos/statistics.repo.js';
import { PermissionService } from './permission.service.js';

export class LectureEnrollmentsService {
  constructor(
    private readonly lectureEnrollmentsRepo: LectureEnrollmentsRepository,
    private readonly gradesRepo: GradesRepository,
    private readonly statisticsRepo: StatisticsRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 강의수강생 상세 조회 (성적 포함) */
  async getLectureEnrollmentDetail(
    lectureEnrollmentId: string,
    userType: UserType,
    profileId: string,
  ) {
    // 1. 강의수강생 조회 (성적, 강의 정보 포함)
    const lectureEnrollment =
      await this.lectureEnrollmentsRepo.findByIdWithGrades(lectureEnrollmentId);

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 2. 권한 검증 (강사/조교)
    await this.permissionService.validateInstructorAccess(
      lectureEnrollment.lecture.instructorId,
      userType,
      profileId,
    );

    // 3. 각 성적별 평균 및 응시자 수 조회
    const gradesWithStats = lectureEnrollment.grades.map((grade) => {
      // 저장된 통계값 사용 (없으면 기본값 0)
      const average = grade.exam.averageScore ?? 0;
      const totalExaminees = grade.exam.gradesCount;

      return {
        exam: {
          title: grade.exam.title,
          examDate: grade.exam.examDate,
          subject: grade.exam.subject,
          // 소수점 첫째자리 반올림
          average: Math.round(average * 10) / 10,
          totalExaminees,
        },
        grade: {
          score: grade.score,
          rank: grade.rank || 0,
        },
      };
    });

    // 4. 응답 구조화
    return {
      lectureEnrollmentId: lectureEnrollment.id,
      lecture: {
        title: lectureEnrollment.lecture.title,
        instructor: {
          name: lectureEnrollment.lecture.instructor.user.name,
        },
        subject: lectureEnrollment.lecture.subject,
        schoolYear: lectureEnrollment.lecture.schoolYear,
      },
      enrollment: {
        name: lectureEnrollment.enrollment.studentName,
        school: lectureEnrollment.enrollment.school,
        status: lectureEnrollment.enrollment.status,
      },
      grades: gradesWithStats,
    };
  }
}
