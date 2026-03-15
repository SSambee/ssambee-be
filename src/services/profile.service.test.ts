import { ProfileService } from './profile.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '../err/http.exception.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { createMockPrisma } from '../test/mocks/prisma.mock.js';

import { ProfileRepository } from '../repos/profile.repo.js';

describe('ProfileService - @unit', () => {
  let profileService: ProfileService;
  let mockProfileRepo: jest.Mocked<ProfileRepository>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockPrisma = createMockPrisma() as unknown as PrismaClient;
    mockProfileRepo = {
      getInstructorProfileWithLectures: jest.fn(),
      updateInstructorProfile: jest.fn(),
      getAssistantProfileWithInstructorLectures: jest.fn(),
      updateAssistantProfile: jest.fn(),
      getStudentProfileWithEnrollments: jest.fn(),
      updateStudentProfile: jest.fn(),
      getParentProfileWithChildren: jest.fn(),
      updateParentProfile: jest.fn(),
    } as unknown as jest.Mocked<ProfileRepository>;
    profileService = new ProfileService(mockProfileRepo, mockPrisma);
  });

  describe('getMyProfile', () => {
    describe('Instructors', () => {
      it('반환해야 한다:  instructor profile with lectures', async () => {
        const mockProfile = {
          id: 'inst-1',
          phoneNumber: '010-1234-5678',
          subject: 'Math',
          academy: 'ABC',
          createdAt: new Date(),
          user: {
            name: 'Instructor Name',
            email: 'inst@test.com',
            userType: UserType.INSTRUCTOR,
          },
          lectures: [
            {
              id: 'lec-1',
              title: 'Math 101',
              schoolYear: 'High 1',
              status: 'OPEN',
              _count: { lectureEnrollments: 10 },
            },
          ],
        };

        mockProfileRepo.getInstructorProfileWithLectures.mockResolvedValue(
          mockProfile as unknown as Awaited<
            ReturnType<ProfileRepository['getInstructorProfileWithLectures']>
          >,
        );

        const result = await profileService.getMyProfile(
          'inst-1',
          UserType.INSTRUCTOR,
        );

        expect(result).toEqual({
          id: 'inst-1',
          name: 'Instructor Name',
          email: 'inst@test.com',
          phoneNumber: '010-1234-5678',
          subject: 'Math',
          academy: 'ABC',
          userType: UserType.INSTRUCTOR,
          createdAt: mockProfile.createdAt,
          lectures: [
            {
              id: 'lec-1',
              title: 'Math 101',
              schoolYear: 'High 1',
              status: 'OPEN',
              enrollmentCount: 10,
            },
          ],
        });
      });

      it('에러를 던져야 한다:  NotFoundException if instructor profile not found', async () => {
        mockProfileRepo.getInstructorProfileWithLectures.mockResolvedValue(
          null,
        );

        await expect(
          profileService.getMyProfile('inst-1', UserType.INSTRUCTOR),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Assistants', () => {
      it('반환해야 한다:  assistant profile with instructor lectures and exclude memo', async () => {
        const mockProfile = {
          id: 'asst-1',
          phoneNumber: '010-9876-5432',
          memo: 'Private Memo', // Should be excluded
          createdAt: new Date(),
          user: {
            name: 'Assistant Name',
            email: 'asst@test.com',
            userType: UserType.ASSISTANT,
          },
          instructor: {
            id: 'inst-1',
            user: { name: 'Instructor Name' },
          },
          instructorLectures: [
            {
              id: 'lec-1',
              title: 'Math 101',
              schoolYear: 'High 1',
              status: 'OPEN',
              _count: { lectureEnrollments: 10 },
            },
          ],
        };

        mockProfileRepo.getAssistantProfileWithInstructorLectures.mockResolvedValue(
          mockProfile as unknown as Awaited<
            ReturnType<
              ProfileRepository['getAssistantProfileWithInstructorLectures']
            >
          >,
        );

        const result = await profileService.getMyProfile(
          'asst-1',
          UserType.ASSISTANT,
        );

        expect(result).not.toHaveProperty('memo');
        expect(result).toEqual({
          id: 'asst-1',
          name: 'Assistant Name',
          email: 'asst@test.com',
          phoneNumber: '010-9876-5432',
          userType: UserType.ASSISTANT,
          createdAt: mockProfile.createdAt,
          instructor: {
            id: 'inst-1',
            name: 'Instructor Name',
          },
          instructorLectures: [
            {
              id: 'lec-1',
              title: 'Math 101',
              schoolYear: 'High 1',
              status: 'OPEN',
              enrollmentCount: 10,
            },
          ],
        });
      });

      it('에러를 던져야 한다:  NotFoundException if assistant profile not found', async () => {
        mockProfileRepo.getAssistantProfileWithInstructorLectures.mockResolvedValue(
          null,
        );

        await expect(
          profileService.getMyProfile('asst-1', UserType.ASSISTANT),
        ).rejects.toThrow(NotFoundException);
      });
    });

    it('에러를 던져야 한다:  BadRequestException for unsupported user type', async () => {
      await expect(
        profileService.getMyProfile('id', 'UNKNOWN' as UserType),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateMyProfile', () => {
    it('에러를 던져야 한다:  BadRequestException if data is empty', async () => {
      await expect(
        profileService.updateMyProfile('id', UserType.INSTRUCTOR, {}),
      ).rejects.toThrow(BadRequestException);
    });

    describe('Instructors', () => {
      it('성공적으로 수정해야 한다:  instructor profile', async () => {
        const updateData = {
          name: 'New Name',
          phoneNumber: '010-0000-0000',
          subject: 'New Subject',
        };

        const mockUpdatedProfile = {
          id: 'inst-1',
          phoneNumber: '010-0000-0000',
          subject: 'New Subject',
          academy: 'Old Academy',
          updatedAt: new Date(),
          user: {
            name: 'New Name',
            email: 'inst@test.com',
            userType: UserType.INSTRUCTOR,
          },
        };

        mockProfileRepo.updateInstructorProfile.mockResolvedValue(
          mockUpdatedProfile as unknown as Awaited<
            ReturnType<ProfileRepository['updateInstructorProfile']>
          >,
        );

        const result = await profileService.updateMyProfile(
          'inst-1',
          UserType.INSTRUCTOR,
          updateData,
        );

        expect(mockProfileRepo.updateInstructorProfile).toHaveBeenCalledWith(
          'inst-1',
          updateData,
        );
        expect(result.name).toBe('New Name');
        expect(result.subject).toBe('New Subject');
      });

      it('에러를 던져야 한다:  ConflictException on P2002 error', async () => {
        const error = new Prisma.PrismaClientKnownRequestError('', {
          code: 'P2002',
          clientVersion: '1',
        });
        mockProfileRepo.updateInstructorProfile.mockRejectedValue(error);

        await expect(
          profileService.updateMyProfile('inst-1', UserType.INSTRUCTOR, {
            phoneNumber: 'duplicate',
          }),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('Assistants', () => {
      it('성공적으로 수정해야 한다:  assistant profile filtering allowed fields', async () => {
        const updateData = {
          name: 'New Name',
          phoneNumber: '010-0000-0000',
          subject: 'Ignored', // Should be ignored
          academy: 'Ignored', // Should be ignored
        };

        const mockUpdatedProfile = {
          id: 'asst-1',
          phoneNumber: '010-0000-0000',
          updatedAt: new Date(),
          user: {
            name: 'New Name',
            email: 'asst@test.com',
            userType: UserType.ASSISTANT,
          },
        };

        mockProfileRepo.updateAssistantProfile.mockResolvedValue(
          mockUpdatedProfile as unknown as Awaited<
            ReturnType<ProfileRepository['updateAssistantProfile']>
          >,
        );

        const result = await profileService.updateMyProfile(
          'asst-1',
          UserType.ASSISTANT,
          updateData,
        );

        expect(mockProfileRepo.updateAssistantProfile).toHaveBeenCalledWith(
          'asst-1',
          {
            name: 'New Name',
            phoneNumber: '010-0000-0000',
          },
        );
        expect(result.name).toBe('New Name');
      });
    });
  });

  describe('getMyProfile - Students/Parents', () => {
    describe('Students', () => {
      it('반환해야 한다:  student profile with instructors list', async () => {
        const mockProfile = {
          id: 'student-1',
          phoneNumber: '010-1111-2222',
          parentPhoneNumber: '010-1111-3333',
          school: 'ABC High School',
          schoolYear: 'High 2',
          createdAt: new Date(),
          user: {
            name: 'Student Name',
            email: 'student@test.com',
            userType: UserType.STUDENT,
          },
          enrollments: [
            {
              instructor: {
                id: 'inst-1',
                academy: 'Seoul Academy',
                subject: 'Math',
                user: { name: 'Instructor A' },
              },
            },
            {
              instructor: {
                id: 'inst-2',
                academy: 'Busan Academy',
                subject: 'English',
                user: { name: 'Instructor B' },
              },
            },
          ],
        };

        mockProfileRepo.getStudentProfileWithEnrollments.mockResolvedValue(
          mockProfile as unknown as Awaited<
            ReturnType<ProfileRepository['getStudentProfileWithEnrollments']>
          >,
        );

        const result = await profileService.getMyProfile(
          'student-1',
          UserType.STUDENT,
        );

        expect(result).toEqual({
          id: 'student-1',
          name: 'Student Name',
          email: 'student@test.com',
          phoneNumber: '010-1111-2222',
          parentPhoneNumber: '010-1111-3333',
          school: 'ABC High School',
          schoolYear: 'High 2',
          userType: UserType.STUDENT,
          createdAt: mockProfile.createdAt,
          instructors: expect.arrayContaining([
            {
              instructorId: 'inst-1',
              instructorName: 'Instructor A',
              academy: 'Seoul Academy',
              subject: 'Math',
            },
            {
              instructorId: 'inst-2',
              instructorName: 'Instructor B',
              academy: 'Busan Academy',
              subject: 'English',
            },
          ]),
        });
      });

      it('에러를 던져야 한다:  NotFoundException if student profile not found', async () => {
        mockProfileRepo.getStudentProfileWithEnrollments.mockResolvedValue(
          null,
        );

        await expect(
          profileService.getMyProfile('student-1', UserType.STUDENT),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Parents', () => {
      it('반환해야 한다:  parent profile with children list', async () => {
        const mockProfile = {
          id: 'parent-1',
          phoneNumber: '010-3333-4444',
          createdAt: new Date(),
          user: {
            name: 'Parent Name',
            email: 'parent@test.com',
            userType: UserType.PARENT,
          },
          childLinks: [
            {
              id: 'link-1',
              name: 'Child A',
              phoneNumber: '010-1111-1111',
            },
            {
              id: 'link-2',
              name: 'Child B',
              phoneNumber: '010-2222-2222',
            },
          ],
        };

        mockProfileRepo.getParentProfileWithChildren.mockResolvedValue(
          mockProfile as unknown as Awaited<
            ReturnType<ProfileRepository['getParentProfileWithChildren']>
          >,
        );

        const result = await profileService.getMyProfile(
          'parent-1',
          UserType.PARENT,
        );

        expect(result).toEqual({
          id: 'parent-1',
          name: 'Parent Name',
          email: 'parent@test.com',
          phoneNumber: '010-3333-4444',
          userType: UserType.PARENT,
          createdAt: mockProfile.createdAt,
          children: [
            { id: 'link-1', name: 'Child A', phoneNumber: '010-1111-1111' },
            { id: 'link-2', name: 'Child B', phoneNumber: '010-2222-2222' },
          ],
        });
      });
    });
  });

  describe('updateMyProfile - Students/Parents', () => {
    describe('Students', () => {
      it('성공적으로 수정해야 한다:  student profile and sync enrollments', async () => {
        const updateData = {
          name: 'New Student Name',
          phoneNumber: '010-9999-8888',
          school: 'New School',
          schoolYear: 'High 3',
          parentPhoneNumber: '010-1234-5678',
        };

        const mockUpdatedProfile = {
          id: 'student-1',
          phoneNumber: '010-9999-8888',
          parentPhoneNumber: '010-1234-5678',
          school: 'New School',
          schoolYear: 'High 3',
          updatedAt: new Date(),
          user: {
            name: 'New Student Name',
            email: 'student@test.com',
            userType: UserType.STUDENT,
          },
        };

        mockProfileRepo.updateStudentProfile.mockResolvedValue(
          mockUpdatedProfile as unknown as Awaited<
            ReturnType<ProfileRepository['updateStudentProfile']>
          >,
        );

        const result = await profileService.updateMyProfile(
          'student-1',
          UserType.STUDENT,
          updateData,
        );

        expect(mockProfileRepo.updateStudentProfile).toHaveBeenCalledWith(
          'student-1',
          updateData,
        );
        expect(result.name).toBe('New Student Name');
        expect(result.school).toBe('New School');
      });
    });

    describe('Parents', () => {
      it('성공적으로 수정해야 한다:  parent profile', async () => {
        const updateData = {
          name: 'New Parent Name',
          phoneNumber: '010-5555-6666',
        };

        const mockUpdatedProfile = {
          id: 'parent-1',
          phoneNumber: '010-5555-6666',
          updatedAt: new Date(),
          user: {
            name: 'New Parent Name',
            email: 'parent@test.com',
            userType: UserType.PARENT,
          },
        };

        mockProfileRepo.updateParentProfile.mockResolvedValue(
          mockUpdatedProfile as unknown as Awaited<
            ReturnType<ProfileRepository['updateParentProfile']>
          >,
        );

        const result = await profileService.updateMyProfile(
          'parent-1',
          UserType.PARENT,
          updateData,
        );

        expect(mockProfileRepo.updateParentProfile).toHaveBeenCalledWith(
          'parent-1',
          { name: 'New Parent Name', phoneNumber: '010-5555-6666' },
        );
        expect(result.name).toBe('New Parent Name');
      });
    });
  });
});
