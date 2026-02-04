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

    // 3. 클리닉 생성/동기화 로직 (isAutoClinic이 true인 경우만)
    let createCount = 0;
    let deleteCount = 0;
    let totalFailedCount = 0;

    if (exam.isAutoClinic) {
      // 불합격자 조회
      const failedGrades =
        await this.clinicsRepo.findFailedGradesByExamId(examId);
      totalFailedCount = failedGrades.length;
      const failedEnrollmentIds = failedGrades.map(
        (g) => g.lectureEnrollmentId,
      );

      // 기존 클리닉 상태에 따른 처리
      if (exam.gradingStatus !== GradingStatus.COMPLETED) {
        // [Case A] 채점 완료 전 -> 신규 생성 로직
        const existingClinics = await this.clinicsRepo.findExistingClinics(
          examId,
          failedEnrollmentIds,
        );
        const existingIds = new Set(
          existingClinics.map((c) => c.lectureEnrollmentId),
        );

        const targets = failedGrades.filter(
          (g) => !existingIds.has(g.lectureEnrollmentId),
        );

        if (targets.length > 0) {
          const deadlineDate = deadline ? new Date(deadline) : undefined;
          const assignedInstructorId = lecture.instructorId;

          const createResult = await this.prisma.$transaction(async (tx) => {
            const res = await this.clinicsRepo.createMany(
              targets.map((t) => ({
                lectureId: exam.lectureId,
                examId: examId,
                lectureEnrollmentId: t.lectureEnrollmentId,
                title: title,
                deadline: deadlineDate,
                memo: memo,
                instructorId: assignedInstructorId,
              })),
              tx,
            );

            // 상태 변경 (여기서 함께 처리)
            await this.examsRepo.updateGradingStatus(
              examId,
              GradingStatus.COMPLETED,
              tx,
            );
            return res;
          });
          createCount = createResult.count;
        } else {
          // 생성할 대상이 없더라도 상태는 변경
          await this.examsRepo.updateGradingStatus(
            examId,
            GradingStatus.COMPLETED,
          );
        }
      } else {
        // [Case B] 이미 채점 완료된 경우 -> 동기화(Sync) 로직
        // 1) 전체 기존 클리닉 조회 (이 시험에 대해)
        const allExistingClinics = await this.prisma.clinic.findMany({
          where: { examId },
          select: { lectureEnrollmentId: true },
        });
        const existingIds = new Set(
          allExistingClinics.map((c) => c.lectureEnrollmentId),
        );
        const failedIdsSet = new Set(failedEnrollmentIds);

        // 추가 생성 대상: 불합격자 목록에 있지만 기존 클리닉이 없는 경우
        const toCreate = failedGrades.filter(
          (g) => !existingIds.has(g.lectureEnrollmentId),
        );

        // 삭제 대상: 기존 클리닉은 있지만 불합격자 목록에 없는 경우 (합격자로 변경됨)
        const toDeleteIds = allExistingClinics
          .filter((c) => !failedIdsSet.has(c.lectureEnrollmentId))
          .map((c) => c.lectureEnrollmentId);

        if (toCreate.length > 0 || toDeleteIds.length > 0) {
          await this.prisma.$transaction(async (tx) => {
            if (toDeleteIds.length > 0) {
              const delRes =
                await this.clinicsRepo.deleteManyByExamAndEnrollments(
                  examId,
                  toDeleteIds,
                  tx,
                );
              deleteCount = delRes.count;
            }
            if (toCreate.length > 0) {
              const deadlineDate = deadline ? new Date(deadline) : undefined;
              const assignedInstructorId = lecture.instructorId;
              const createRes = await this.clinicsRepo.createMany(
                toCreate.map((t) => ({
                  lectureId: exam.lectureId,
                  examId: examId,
                  lectureEnrollmentId: t.lectureEnrollmentId,
                  title: title,
                  deadline: deadlineDate,
                  memo: memo,
                  instructorId: assignedInstructorId,
                })),
                tx,
              );
              createCount = createRes.count;
            }
          });
        }
      }
    } else {
      // isAutoClinic 가 false인 경우 상태만 COMPLETED로 변경
      if (exam.gradingStatus !== GradingStatus.COMPLETED) {
        await this.examsRepo.updateGradingStatus(
          examId,
          GradingStatus.COMPLETED,
        );
      }
    }

    let message = '채점이 완료되었습니다.';
    if (exam.isAutoClinic) {
      message += ` (클리닉 생성: ${createCount}건, 삭제: ${deleteCount}건, 총 불합격자: ${totalFailedCount}명)`;
    }

    return {
      createCount,
      deleteCount,
      message,
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
    // (examId, lectureEnrollmentId) 조합으로 조회
    const grades = await this.prisma.grade.findMany({
      where: {
        OR: clinics.map((c) => ({
          examId: c.examId,
          lectureEnrollmentId: c.lectureEnrollmentId,
        })),
      },
      select: {
        examId: true,
        lectureEnrollmentId: true,
        score: true,
      },
    });

    // 검색 최적화를 위한 Map 생성
    const gradeMap = new Map<string, number>();
    grades.forEach((g) => {
      gradeMap.set(`${g.examId}:${g.lectureEnrollmentId}`, g.score);
    });

    // 4. 응답 데이터 매핑
    return clinics.map((clinic) => {
      const score =
        gradeMap.get(`${clinic.examId}:${clinic.lectureEnrollmentId}`) ?? 0;

      return {
        id: clinic.id,
        student: {
          id: clinic.lectureEnrollment.enrollment.id, // enrollmentId를 식별자로 사용
          name: clinic.lectureEnrollment.enrollment.studentName,
          school: clinic.lectureEnrollment.enrollment.school,
          schoolYear: clinic.lectureEnrollment.enrollment.schoolYear,
          phone: clinic.lectureEnrollment.enrollment.studentPhone,
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
      studentName: clinic.lectureEnrollment.enrollment.studentName,
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
      studentName: clinic.lectureEnrollment.enrollment.studentName,
    }));
  }
}
