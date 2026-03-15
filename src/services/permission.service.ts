import { UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import type { Enrollment } from '../generated/prisma/client.js';

export class PermissionService {
  constructor(
    private readonly assistantRepository: AssistantRepository,
    private readonly parentChildLinkRepository: ParentChildLinkRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
  ) {}

  /** 강사/조교 쓰기 권한 체크 */
  async validateInstructorAccess(
    instructorId: string,
    userType: UserType,
    profileId: string,
  ) {
    const effectiveId = await this.getEffectiveInstructorId(
      userType,
      profileId,
    );

    if (effectiveId !== instructorId) {
      throw new ForbiddenException('해당 권한이 없습니다.');
    }
  }

  /** 실제 권한을 가진 강사 ID 추출 */
  async getEffectiveInstructorId(
    userType: UserType,
    profileId: string,
  ): Promise<string> {
    if (userType === UserType.INSTRUCTOR) {
      return profileId;
    }

    if (userType === UserType.ASSISTANT) {
      const assistant = await this.assistantRepository.findById(profileId);
      if (!assistant) {
        throw new ForbiddenException('조교 정보를 찾을 수 없습니다.');
      }
      return assistant.instructorId;
    }

    throw new ForbiddenException('강사 또는 조교만 접근 가능합니다.');
  }

  /** 학생 권한 체크 */
  async validateStudentAccess(profileId: string, studentId: string) {
    if (profileId !== studentId) {
      throw new ForbiddenException('본인의 정보만 조회할 수 있습니다.');
    }
  }

  /** 자녀 접근 권한 검증 */
  async validateChildAccess(
    userType: UserType,
    profileId: string,
    childLinkId: string,
  ) {
    if (userType !== UserType.PARENT) {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    const childLink =
      await this.parentChildLinkRepository.findById(childLinkId);
    if (!childLink) {
      throw new NotFoundException('자녀 정보를 찾을 수 없습니다.');
    }

    if (childLink.appParentId !== profileId) {
      throw new ForbiddenException('본인의 자녀만 조회할 수 있습니다.');
    }

    return childLink;
  }

  /** 수강 정보 조회 권한 체크 (강사/조교/학생/학부모 통합) */
  async validateEnrollmentReadAccess(
    enrollment: Enrollment,
    userType: UserType,
    profileId: string,
  ) {
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      await this.validateInstructorAccess(
        enrollment.instructorId,
        userType,
        profileId,
      );
      return;
    }

    if (userType === UserType.STUDENT) {
      await this.validateStudentAccess(profileId, enrollment.appStudentId!);
      return;
    }

    if (userType === UserType.PARENT) {
      if (!enrollment.appParentLinkId) {
        throw new ForbiddenException('연결된 자녀 정보가 없습니다.');
      }
      await this.validateChildAccess(
        userType,
        profileId,
        enrollment.appParentLinkId,
      );
      return;
    }

    throw new ForbiddenException('접근 권한이 없습니다.');
  }

  /** LectureEnrollment 기반 수강 정보 조회 권한 체크 (학생/학부모용) */
  async validateLectureEnrollmentReadAccess(
    lectureEnrollment: { enrollment: Enrollment },
    userType: UserType,
    profileId: string,
  ) {
    // LectureEnrollment에서 Enrollment 정보를 추출하여 기존 권한 검증 로직 위임
    await this.validateEnrollmentReadAccess(
      lectureEnrollment.enrollment,
      userType,
      profileId,
    );
  }

  /** 강의 읽기 권한 체크 (강사/조교/학생/학부모) */
  async validateLectureReadAccess(
    lectureId: string,
    lecture: { instructorId: string },
    userType: UserType,
    profileId: string,
  ) {
    // 강사/조교: 해당 강의 담당자인지 확인
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      await this.validateInstructorAccess(
        lecture.instructorId,
        userType,
        profileId,
      );
      return;
    }

    // 학생: 수강 여부 확인
    if (userType === UserType.STUDENT) {
      const isEnrolled =
        await this.lectureEnrollmentsRepository.existsByLectureIdAndStudentId(
          lectureId,
          profileId,
        );
      if (!isEnrolled) {
        throw new ForbiddenException('수강 중인 강의가 아닙니다.');
      }
      return;
    }

    // 학부모: 자녀의 수강 여부 확인
    if (userType === UserType.PARENT) {
      await this.validateParentLectureAccess(profileId, lectureId);
      return;
    }

    throw new ForbiddenException('접근 권한이 없습니다.');
  }

  /** 학생이 특정 강사의 강의를 하나라도 수강 중인지 확인 */
  async validateInstructorStudentLink(instructorId: string, studentId: string) {
    const isEnrolled =
      await this.lectureEnrollmentsRepository.existsByInstructorIdAndStudentId(
        instructorId,
        studentId,
      );

    if (!isEnrolled) {
      throw new ForbiddenException('해당 강사의 수강생이 아닙니다.');
    }
  }

  /** Assistant ID로 Instructor ID 조회 */
  async getInstructorIdByAssistantId(
    assistantId: string,
  ): Promise<string | null> {
    const assistant = await this.assistantRepository.findById(assistantId);
    return assistant?.instructorId || null;
  }

  // ----------------------------------------------------------------
  // Parent Permission Methods (NEW)
  // ----------------------------------------------------------------

  /** 학부모가 특정 Enrollment에 접근 가능한지 확인 */
  async validateParentEnrollmentAccess(
    parentProfileId: string,
    enrollmentId: string,
  ): Promise<Enrollment> {
    const enrollment = await this.enrollmentsRepository.findById(enrollmentId);
    if (!enrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    if (!enrollment.appParentLinkId) {
      throw new ForbiddenException('학부모 연결 정보가 없습니다.');
    }

    await this.validateChildAccess(
      UserType.PARENT,
      parentProfileId,
      enrollment.appParentLinkId,
    );

    return enrollment;
  }

  /** 학부모의 모든 자녀 Enrollment ID 목록 조회 */
  async getParentEnrollmentIds(parentProfileId: string): Promise<string[]> {
    const childLinks =
      await this.parentChildLinkRepository.findByAppParentId(parentProfileId);

    if (!childLinks || childLinks.length === 0) {
      return [];
    }

    const linkIds = childLinks.map((link) => link.id);
    const enrollments =
      await this.enrollmentsRepository.findManyByAppParentLinkIds(linkIds);

    return enrollments.map((e) => e.id);
  }

  /** 학부모가 특정 강의에 접근 가능한지 확인 (자녀 수강 여부) */
  async validateParentLectureAccess(
    parentProfileId: string,
    lectureId: string,
  ): Promise<void> {
    const enrollmentIds = await this.getParentEnrollmentIds(parentProfileId);

    if (!enrollmentIds || enrollmentIds.length === 0) {
      throw new ForbiddenException('등록된 자녀가 없습니다.');
    }

    const hasAccess =
      await this.lectureEnrollmentsRepository.existsByLectureIdAndEnrollmentIds(
        lectureId,
        enrollmentIds,
      );

    if (!hasAccess) {
      throw new ForbiddenException('자녀가 수강 중인 강의가 아닙니다.');
    }
  }

  /** 학부모의 모든 자녀 링크 목록 조회 */
  async getChildLinks(parentProfileId: string) {
    return await this.parentChildLinkRepository.findByAppParentId(
      parentProfileId,
    );
  }
}
