import { ProfileService } from './profile.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  BadRequestException,
  ConflictException,
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
    } as unknown as jest.Mocked<ProfileRepository>;
    profileService = new ProfileService(mockProfileRepo, mockPrisma);
  });

  describe('getMyProfile', () => {
    describe('Instructors', () => {
      it('should return instructor profile with lectures', async () => {
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

      it('should throw NotFoundException if instructor profile not found', async () => {
        mockProfileRepo.getInstructorProfileWithLectures.mockResolvedValue(
          null,
        );

        await expect(
          profileService.getMyProfile('inst-1', UserType.INSTRUCTOR),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Assistants', () => {
      it('should return assistant profile with instructor lectures and exclude memo', async () => {
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

      it('should throw NotFoundException if assistant profile not found', async () => {
        mockProfileRepo.getAssistantProfileWithInstructorLectures.mockResolvedValue(
          null,
        );

        await expect(
          profileService.getMyProfile('asst-1', UserType.ASSISTANT),
        ).rejects.toThrow(NotFoundException);
      });
    });

    it('should throw BadRequestException for unsupported user type', async () => {
      await expect(
        profileService.getMyProfile('id', UserType.STUDENT),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateMyProfile', () => {
    it('should throw BadRequestException if data is empty', async () => {
      await expect(
        profileService.updateMyProfile('id', UserType.INSTRUCTOR, {}),
      ).rejects.toThrow(BadRequestException);
    });

    describe('Instructors', () => {
      it('should update instructor profile', async () => {
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

      it('should throw ConflictException on P2002 error', async () => {
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
      it('should update assistant profile filtering allowed fields', async () => {
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
});
