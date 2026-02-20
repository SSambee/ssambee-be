import { PrismaClient } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '../err/http.exception.js';
import { ParentRepository } from '../repos/parent.repo.js';
import { ParentChildLinkRepository } from '../repos/parent-child-link.repo.js';
import { EnrollmentsRepository } from '../repos/enrollments.repo.js';
import { PermissionService } from './permission.service.js';
import type { CreateChildDto } from '../validations/children.validation.js';
import type { GetSvcEnrollmentsQueryDto } from '../validations/enrollments.validation.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

export class ParentsService {
  constructor(
    private readonly parentRepository: ParentRepository,
    private readonly parentChildLinkRepository: ParentChildLinkRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaClient,
  ) {}

  /** 자녀 등록 (및 기존 수강 내역 자동 연결) */
  async registerChild(
    userType: UserType,
    profileId: string,
    data: CreateChildDto,
  ) {
    if (userType !== UserType.PARENT) {
      throw new ForbiddenException('학부모만 자녀를 등록할 수 있습니다.');
    }

    // 1. 이미 등록된 자녀인지 확인 (동일 부모 - 동일 번호)
    const existingLink =
      await this.parentChildLinkRepository.findByParentIdAndPhoneNumber(
        profileId,
        data.phoneNumber,
      );

    if (existingLink) {
      throw new BadRequestException('이미 등록된 자녀 번호입니다.');
    }

    return await this.prisma.$transaction(async (tx) => {
      // 2. ParentChildLink 생성
      const newLink = await this.parentChildLinkRepository.create(
        {
          appParentId: profileId,
          name: data.name,
          phoneNumber: data.phoneNumber,
        },
        tx,
      );

      // 3. 기존 Enrollment 중 해당 자녀 번호로 된 것들을 찾아 자동 연결 (Backfill)
      await this.enrollmentsRepository.updateAppParentLinkIdByStudentPhone(
        data.phoneNumber,
        newLink.id,
        tx,
      );

      return newLink;
    });
  }

  /** 내 자녀 목록 조회 */
  async getChildren(userType: UserType, profileId: string) {
    if (userType !== UserType.PARENT) {
      throw new ForbiddenException('학부모만 자녀 목록을 조회할 수 있습니다.');
    }

    return await this.parentChildLinkRepository.findByAppParentId(profileId);
  }

  /** 자녀의 수강 목록 조회 (강의 기반) */
  async getChildEnrollments(
    userType: UserType,
    profileId: string,
    childId: string,
    query: GetSvcEnrollmentsQueryDto = {
      page: 1, // Default value from schema
      limit: 20, // Default value from schema
    },
  ) {
    // 1. 자녀 링크 검증
    const childLink = await this.permissionService.validateChildAccess(
      userType,
      profileId,
      childId,
    );

    const { page = 1, limit = 20 } = query;
    const offset = (page - 1) * limit;

    // 2. 해당 링크 ID로 수강 목록 조회 (LectureEnrollment)
    const { lectureEnrollments, totalCount } =
      await this.lectureEnrollmentsRepository.findManyByAppParentLinkId(
        childLink.id,
        { limit, offset },
      );

    return {
      enrollments: lectureEnrollments,
      totalCount,
    };
  }

  /** 자녀의 수강 상세 조회 (강의 기반) */
  async getChildEnrollmentDetail(
    userType: UserType,
    profileId: string,
    childId: string,
    lectureEnrollmentId: string, // URL param: enrollmentId -> logic: lectureEnrollmentId
  ) {
    // 1. 자녀 링크 검증
    const childLink = await this.permissionService.validateChildAccess(
      userType,
      profileId,
      childId,
    );

    // 2. 수강 상세 조회 (LectureEnrollment)
    const lectureEnrollment =
      await this.lectureEnrollmentsRepository.findByIdWithDetails(
        lectureEnrollmentId,
      );

    if (!lectureEnrollment) {
      throw new NotFoundException('수강 정보를 찾을 수 없습니다.');
    }

    // 3. 해당 수강 정보가 내 자녀의 것이 맞는지 확인
    if (lectureEnrollment.enrollment.appParentLinkId !== childLink.id) {
      throw new ForbiddenException(
        '해당 자녀의 수강 정보가 아니거나 접근 권한이 없습니다.',
      );
    }

    return lectureEnrollment;
  }

  /** 학부모 자녀 정보를 전화번호로 조회 (가장 최근 것 하나) */
  async findLinkByPhoneNumber(phoneNumber: string) {
    const links =
      await this.parentChildLinkRepository.findManyByPhoneNumber(phoneNumber);
    return links.length > 0 ? links[0] : null;
  }

  /** 학생 정보(학생 번호/이름/부모 번호)로 학부모 자녀 링크 조회 */
  async findLinkByPhoneNumberAndProfile(
    studentPhone: string,
    studentName: string,
    parentPhoneNumber: string,
  ) {
    return await this.parentChildLinkRepository.findByPhoneNumberAndProfile(
      studentPhone,
      studentName,
      parentPhoneNumber,
    );
  }
}
