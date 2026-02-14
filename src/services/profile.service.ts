import { PrismaClient } from '../generated/prisma/client.js';
import { ProfileRepository } from '../repos/profile.repo.js';
import { UpdateMyProfileDto } from '../validations/profile.validation.js';
import { UserType } from '../constants/auth.constant.js';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../err/http.exception.js';
import { Prisma } from '../generated/prisma/client.js';

export class ProfileService {
  constructor(
    private readonly profileRepo: ProfileRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * 내 프로필 조회
   */
  async getMyProfile(profileId: string, userType: UserType) {
    if (userType === UserType.INSTRUCTOR) {
      const profile =
        await this.profileRepo.getInstructorProfileWithLectures(profileId);

      if (!profile) {
        throw new NotFoundException('프로필을 찾을 수 없습니다.');
      }

      // 응답 형식 변환
      return {
        id: profile.id,
        name: profile.user.name,
        email: profile.user.email,
        phoneNumber: profile.phoneNumber,
        subject: profile.subject,
        academy: profile.academy,
        userType: profile.user.userType,
        createdAt: profile.createdAt,
        lectures: profile.lectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          schoolYear: lecture.schoolYear,
          status: lecture.status,
          enrollmentCount: lecture._count.lectureEnrollments,
        })),
      };
    } else if (userType === UserType.ASSISTANT) {
      const profile =
        await this.profileRepo.getAssistantProfileWithInstructorLectures(
          profileId,
        );

      if (!profile) {
        throw new NotFoundException('프로필을 찾을 수 없습니다.');
      }

      // 응답 형식 변환 (memo 제외)
      const { memo: _, ...safeProfile } = profile;

      return {
        id: safeProfile.id,
        name: safeProfile.user?.name,
        email: safeProfile.user?.email,
        phoneNumber: safeProfile.phoneNumber,
        userType: safeProfile.user?.userType,
        createdAt: safeProfile.createdAt,
        instructor: {
          id: safeProfile.instructor.id,
          name: safeProfile.instructor.user.name,
        },
        instructorLectures: profile.instructorLectures.map((lecture) => ({
          id: lecture.id,
          title: lecture.title,
          schoolYear: lecture.schoolYear,
          status: lecture.status,
          enrollmentCount: lecture._count.lectureEnrollments,
        })),
      };
    } else if (userType === UserType.STUDENT) {
      const profile =
        await this.profileRepo.getStudentProfileWithEnrollments(profileId);

      if (!profile) {
        throw new NotFoundException('프로필을 찾을 수 없습니다.');
      }

      // 강사 목록 중복 제거 및 변환
      const instructorMap = new Map();
      profile.enrollments.forEach((enrollment) => {
        const instructor = enrollment.instructor;
        if (!instructorMap.has(instructor.id)) {
          instructorMap.set(instructor.id, {
            instructorId: instructor.id,
            instructorName: instructor.user.name,
            academy: instructor.academy,
            subject: instructor.subject,
          });
        }
      });

      return {
        id: profile.id,
        name: profile.user.name,
        email: profile.user.email,
        phoneNumber: profile.phoneNumber,
        school: profile.school,
        schoolYear: profile.schoolYear,
        userType: profile.user.userType,
        createdAt: profile.createdAt,
        instructors: Array.from(instructorMap.values()),
      };
    } else if (userType === UserType.PARENT) {
      const profile =
        await this.profileRepo.getParentProfileWithChildren(profileId);

      if (!profile) {
        throw new NotFoundException('프로필을 찾을 수 없습니다.');
      }

      return {
        id: profile.id,
        name: profile.user.name,
        email: profile.user.email,
        phoneNumber: profile.phoneNumber,
        userType: profile.user.userType,
        createdAt: profile.createdAt,
        children: profile.childLinks.map((link) => ({
          id: link.id,
          name: link.name,
          phoneNumber: link.phoneNumber,
        })),
      };
    } else {
      throw new BadRequestException('지원하지 않는 유저 타입입니다.');
    }
  }

  /**
   * 내 프로필 수정
   */
  async updateMyProfile(
    profileId: string,
    userType: UserType,
    data: UpdateMyProfileDto,
  ) {
    // 빈 객체 체크
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('수정할 데이터가 없습니다.');
    }

    try {
      if (userType === UserType.INSTRUCTOR) {
        // 강사: 모든 필드 허용
        const profile = await this.profileRepo.updateInstructorProfile(
          profileId,
          data,
        );

        return {
          id: profile.id,
          name: profile.user.name,
          email: profile.user.email,
          phoneNumber: profile.phoneNumber,
          subject: profile.subject,
          academy: profile.academy,
          userType: profile.user.userType,
          updatedAt: profile.updatedAt,
        };
      } else if (userType === UserType.ASSISTANT) {
        // 조교: name, phoneNumber만 허용
        const { name, phoneNumber } = data;
        // subject, academy는 무시됨

        const profile = await this.profileRepo.updateAssistantProfile(
          profileId,
          { name, phoneNumber },
        );

        return {
          id: profile.id,
          name: profile.user?.name,
          email: profile.user?.email,
          phoneNumber: profile.phoneNumber,
          userType: profile.user?.userType,
          updatedAt: profile.updatedAt,
        };
      } else if (userType === UserType.STUDENT) {
        // 학생: name, phoneNumber, school, schoolYear만 허용
        const { name, phoneNumber, school, schoolYear } = data;

        const profile = await this.profileRepo.updateStudentProfile(profileId, {
          name,
          phoneNumber,
          school,
          schoolYear,
        });

        return {
          id: profile.id,
          name: profile.user.name,
          email: profile.user.email,
          phoneNumber: profile.phoneNumber,
          school: profile.school,
          schoolYear: profile.schoolYear,
          userType: profile.user.userType,
          updatedAt: profile.updatedAt,
        };
      } else if (userType === UserType.PARENT) {
        // 학부모: name, phoneNumber만 허용
        const { name, phoneNumber } = data;

        const profile = await this.profileRepo.updateParentProfile(profileId, {
          name,
          phoneNumber,
        });

        return {
          id: profile.id,
          name: profile.user.name,
          email: profile.user.email,
          phoneNumber: profile.phoneNumber,
          userType: profile.user.userType,
          updatedAt: profile.updatedAt,
        };
      } else {
        throw new BadRequestException('지원하지 않는 유저 타입입니다.');
      }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 사용 중인 전화번호입니다.');
      }
      throw error;
    }
  }
}
