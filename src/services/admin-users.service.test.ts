import { AdminUsersService } from './admin-users.service.js';
import type { AdminUsersRepository } from '../repos/admin-users.repo.js';
import { UserType } from '../constants/auth.constant.js';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockAdminUsersRepo: jest.Mocked<Partial<AdminUsersRepository>>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-03T00:00:00.000Z'));

    mockAdminUsersRepo = {
      listUsers: jest.fn(),
      getUserStats: jest.fn(),
    };

    service = new AdminUsersService(mockAdminUsersRepo as AdminUsersRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('마지막 접속일 기준으로 활성/비활성 상태를 계산해야 한다', async () => {
    (mockAdminUsersRepo.listUsers as jest.Mock).mockResolvedValue({
      totalCount: 4,
      users: [
        {
          profileId: 'instructor-active',
          userId: 'user-active',
          userType: UserType.INSTRUCTOR,
          name: '활성 강사',
          email: 'active@example.com',
          phoneNumber: '010-1111-1111',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: new Date('2026-03-04T00:00:00.000Z'),
          hasActiveSession: true,
          instructorProfileId: 'instructor-active',
          instructorAcademy: '테스트 학원',
          instructorSubject: '수학',
          assistantInstructorId: null,
          assistantInstructorName: null,
          assistantSignStatus: null,
          studentSchool: null,
          studentSchoolYear: null,
          studentParentPhoneNumber: null,
          parentChildCount: 0,
        },
        {
          profileId: 'assistant-boundary',
          userId: 'user-boundary',
          userType: UserType.ASSISTANT,
          name: '경계 조교',
          email: 'boundary@example.com',
          phoneNumber: '010-2222-2222',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: new Date('2026-03-04T00:00:00.000Z'),
          hasActiveSession: false,
          instructorProfileId: null,
          instructorAcademy: null,
          instructorSubject: null,
          assistantInstructorId: 'instructor-owner',
          assistantInstructorName: '담당 강사',
          assistantSignStatus: 'SIGNED',
          studentSchool: null,
          studentSchoolYear: null,
          studentParentPhoneNumber: null,
          parentChildCount: 0,
        },
        {
          profileId: 'student-inactive',
          userId: 'user-inactive',
          userType: UserType.STUDENT,
          name: '비활성 학생',
          email: 'inactive@example.com',
          phoneNumber: '010-3333-3333',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: null,
          hasActiveSession: false,
          instructorProfileId: null,
          instructorAcademy: null,
          instructorSubject: null,
          assistantInstructorId: null,
          assistantInstructorName: null,
          assistantSignStatus: null,
          studentSchool: '테스트 학교',
          studentSchoolYear: '3',
          studentParentPhoneNumber: '010-9999-9999',
          parentChildCount: 0,
        },
        {
          profileId: 'parent-user',
          userId: 'user-parent',
          userType: UserType.PARENT,
          name: '학부모 사용자',
          email: 'parent@example.com',
          phoneNumber: '010-4444-4444',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: null,
          hasActiveSession: false,
          instructorProfileId: null,
          instructorAcademy: null,
          instructorSubject: null,
          assistantInstructorId: null,
          assistantInstructorName: null,
          assistantSignStatus: null,
          studentSchool: null,
          studentSchoolYear: null,
          studentParentPhoneNumber: null,
          parentChildCount: 2,
        },
      ],
    });

    const result = await service.listUsers({
      userType: 'all',
      activityStatus: 'all',
      sessionStatus: 'all',
      page: 1,
      limit: 20,
    });

    expect(result.totalCount).toBe(4);
    expect(result.users[0].activityStatus).toBe('active_30d');
    expect(result.users[0].profile).toEqual({
      academy: '테스트 학원',
      subject: '수학',
    });
    expect(result.users[1].activityStatus).toBe('active_30d');
    expect(result.users[1].profile).toEqual({
      instructorId: 'instructor-owner',
      instructorName: '담당 강사',
      signStatus: 'SIGNED',
    });
    expect(result.users[2].activityStatus).toBe('inactive_30d');
    expect(result.users[2].profile).toEqual({
      school: '테스트 학교',
      schoolYear: '3',
      parentPhoneNumber: '010-9999-9999',
    });
    expect(result.users[3].activityStatus).toBe('inactive_30d');
    expect(result.users[3].profile).toEqual({
      childCount: 2,
    });
  });
});
