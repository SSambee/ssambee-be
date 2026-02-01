import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import { GradingStatus } from '../constants/exams.constant.js';
import {
  NotFoundException,
  BadRequestException,
} from '../err/http.exception.js';
import { ClinicsRepository } from '../repos/clinics.repo.js';
import { ExamsRepository } from '../repos/exams.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { PermissionService } from './permission.service.js';
import type {
  CreateClinicsDto,
  UpdateClinicsDto,
} from '../validations/clinics.validation.js';

export class ClinicsService {
  constructor(
    private readonly clinicsRepo: ClinicsRepository,
    private readonly examsRepo: ExamsRepository,
    private readonly lecturesRepo: LecturesRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 채점 완료 및 클리닉 일괄 생성 */
  async completeGrading(
    examId: string,
    data: CreateClinicsDto,
    userType: UserType,
    profileId: string,
  ) {
    const { title: inputTitle, deadline, memo } = data;

    // 1. Exam 확인
    const exam = await this.examsRepo.findById(examId);
    if (!exam) {
      throw new NotFoundException('시험을 찾을 수 없습니다.');
    }

    // Default Title Setting
    const title = inputTitle || `${exam.title} 클리닉`;

    // 2. 권한 검증 (강사/조교)
    const lecture = await this.lecturesRepo.findById(exam.lectureId);
    if (!lecture) {
      throw new NotFoundException('강의를 찾을 수 없습니다.');
    }
    await this.permissionService.validateInstructorAccess(
      lecture.instructorId,
      userType,
      profileId,
    );

    // 2-1. 채점 상태 검증 (채점 중일 경우에만 완료 처리 가능)
    if (exam.gradingStatus !== GradingStatus.IN_PROGRESS) {
      throw new BadRequestException(
        '채점이 진행 중인 시험에 대해서만 채점 완료(클리닉 생성)를 수행할 수 있습니다.',
      );
    }

    // 3. 불합격자 조회
    const failedGrades =
      await this.clinicsRepo.findFailedGradesByExamId(examId);

    // 4. 중복 생성 방지
    // 이미 클리닉이 생성된 enrollmentId 조회
    const enrollmentIds = failedGrades.map((g) => g.enrollmentId);
    let targets = failedGrades;

    if (failedGrades.length > 0) {
      const existingClinics = await this.clinicsRepo.findExistingClinics(
        examId,
        enrollmentIds,
      );
      const existingEnrollmentIds = new Set(
        existingClinics.map((c) => c.enrollmentId),
      );

      // 5. 생성할 데이터 준비
      // 중복되지 않은 학생들만 필터링
      targets = failedGrades.filter(
        (g) => !existingEnrollmentIds.has(g.enrollmentId),
      );
    }

    // 6. 일괄 생성 (Transaction)
    const deadlineDate = deadline ? new Date(deadline) : undefined;
    const assignedInstructorId = lecture.instructorId;

    const result = await this.prisma.$transaction(async (tx) => {
      let createCount = 0;
      if (targets.length > 0) {
        const createResult = await this.clinicsRepo.createMany(
          targets.map((t) => ({
            lectureId: exam.lectureId,
            examId: examId,
            enrollmentId: t.enrollmentId,
            title: title,
            deadline: deadlineDate,
            memo: memo,
            instructorId: assignedInstructorId,
          })),
          tx,
        );
        createCount = createResult.count;
      }

      // 상태 변경 (채점 중 -> 완료)
      await this.examsRepo.updateGradingStatus(
        examId,
        GradingStatus.COMPLETED,
        tx,
      );

      return { count: createCount };
    });

    return {
      count: result.count,
      message: `채점이 완료되었습니다. (클리닉 생성: ${result.count}건, 총 불합격자: ${failedGrades.length}명)`,
    };
  }

  /** 강사별 클리닉 조회 */
  async getClinics(
    userType: UserType,
    profileId: string,
    query: { lectureId?: string; examId?: string },
  ) {
    // 1. 강사/조교 권한 확인 및 ID 획득
    let instructorId: string;

    if (userType === UserType.INSTRUCTOR) {
      instructorId = profileId;
    } else if (userType === UserType.ASSISTANT) {
      // 조교의 경우 담당 강사 ID 조회
      const assistant = await this.prisma.assistant.findUnique({
        where: { id: profileId },
        select: { instructorId: true },
      });
      if (!assistant) {
        throw new NotFoundException('조교 정보를 찾을 수 없습니다.');
      }
      instructorId = assistant.instructorId;
    } else {
      throw new BadRequestException('접근 권한이 없습니다.');
    }

    // 2. 클리닉 목록 조회
    const clinics = await this.clinicsRepo.findByInstructor(
      instructorId,
      query,
    );

    if (clinics.length === 0) {
      return [];
    }

    // 3. 성적 정보 조회 (Clinic에는 점수 정보가 없으므로 별도 조회)
    // (examId, enrollmentId) 조합으로 조회
    const grades = await this.prisma.grade.findMany({
      where: {
        OR: clinics.map((c) => ({
          examId: c.examId,
          enrollmentId: c.enrollmentId,
        })),
      },
      select: {
        examId: true,
        enrollmentId: true,
        score: true,
      },
    });

    // 검색 최적화를 위한 Map 생성
    const gradeMap = new Map<string, number>();
    grades.forEach((g) => {
      gradeMap.set(`${g.examId}:${g.enrollmentId}`, g.score);
    });

    // 4. 응답 데이터 매핑
    return clinics.map((clinic) => {
      const score =
        gradeMap.get(`${clinic.examId}:${clinic.enrollmentId}`) ?? 0;

      return {
        id: clinic.id,
        student: {
          id: clinic.enrollment.id, // enrollmentId를 식별자로 사용
          name: clinic.enrollment.studentName,
          school: clinic.enrollment.school,
          schoolYear: clinic.enrollment.schoolYear,
          phone: clinic.enrollment.studentPhone,
        },
        exam: {
          id: clinic.exam.id,
          title: clinic.exam.title,
          cutoffScore: clinic.exam.cutoffScore, // 합격 기준점
          score: score, // 학생 점수
          date: clinic.exam.schedule?.startTime ?? null, // 시험 일자 (Schedule 기준)
        },
        clinic: {
          createdAt: clinic.createdAt, // 클리닉 생성일
          deadline: clinic.deadline,
          status: clinic.status, // 통합된 상태 (PENDING, SENT, COMPLETED)
        },
      };
    });
  }

  /** 클리닉 다중 수정 */
  async updateClinics(
    data: UpdateClinicsDto,
    userType: UserType,
    profileId: string,
  ) {
    const { clinicIds, updates } = data;

    // 1. 수정 대상 클리닉 조회
    const clinics = await this.clinicsRepo.findByIds(clinicIds);

    // 2. 존재 여부 확인
    if (clinics.length !== clinicIds.length) {
      const foundIds = new Set(clinics.map((c) => c.id));
      const missingIds = clinicIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `다음 클리닉 ID를 찾을 수 없습니다: ${missingIds.join(', ')}`,
      );
    }

    // 3. 권한 검증
    // 수동 DI 컨벤션에 따라 PermissionService 사용
    // 모든 클리닉이 해당 강사의 강의에 속하거나 강사가 담당자인지 확인
    for (const clinic of clinics) {
      if (clinic.instructorId === profileId) continue; // 직접 담당자면 통과

      const lecture = await this.lecturesRepo.findById(clinic.lectureId);
      if (!lecture) {
        throw new NotFoundException('강의를 찾을 수 없습니다.');
      }

      await this.permissionService.validateInstructorAccess(
        lecture.instructorId,
        userType,
        profileId,
      );
    }

    // 4. 수정 처리 (Transaction)
    const deadlineDate =
      updates.deadline === undefined
        ? undefined
        : updates.deadline === null
          ? null
          : new Date(updates.deadline);

    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await this.clinicsRepo.updateMany(
        clinicIds,
        {
          status: updates.status,
          deadline: deadlineDate,
          memo: updates.memo,
        },
        tx,
      );
      return updateResult;
    });

    return {
      count: result.count,
      message: `${result.count}개의 클리닉이 수정되었습니다.`,
    };
  }

  /** 학생용 클리닉 조회 */
  async getClinicsByStudent(userType: UserType, profileId: string) {
    if (userType !== UserType.STUDENT) {
      throw new BadRequestException(
        '학생만 이 엔드포인트를 사용할 수 있습니다.',
      );
    }

    const clinics = await this.clinicsRepo.findByAppStudentId(profileId);

    return clinics.map((clinic) => ({
      id: clinic.id,
      title: clinic.title,
      status: clinic.status,
      deadline: clinic.deadline,
      memo: clinic.memo,
      exam: {
        title: clinic.exam.title,
        cutoffScore: clinic.exam.cutoffScore,
      },
      lecture: {
        title: clinic.lecture.title,
        subject: clinic.lecture.subject,
      },
      studentName: clinic.enrollment.studentName,
    }));
  }

  /** 학부모용 클리닉 조회 (ParentChildLink ID 기준) */
  async getClinicsByParentLink(
    parentChildLinkId: string,
    userType: UserType,
    profileId: string,
  ) {
    if (userType !== UserType.PARENT) {
      throw new BadRequestException(
        '학부모만 이 엔드포인트를 사용할 수 있습니다.',
      );
    }

    await this.permissionService.validateChildAccess(
      userType,
      profileId,
      parentChildLinkId,
    );

    const clinics =
      await this.clinicsRepo.findByAppParentLinkId(parentChildLinkId);

    return clinics.map((clinic) => ({
      id: clinic.id,
      title: clinic.title,
      status: clinic.status,
      deadline: clinic.deadline,
      memo: clinic.memo,
      exam: {
        title: clinic.exam.title,
        cutoffScore: clinic.exam.cutoffScore,
      },
      lecture: {
        title: clinic.lecture.title,
        subject: clinic.lecture.subject,
      },
      studentName: clinic.enrollment.studentName,
    }));
  }
}
