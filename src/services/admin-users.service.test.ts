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
      totalCount: 3,
      users: [
        {
          profileId: 'instructor-active',
          instructorId: 'instructor-active',
          userId: 'user-active',
          userType: UserType.INSTRUCTOR,
          name: '활성 강사',
          email: 'active@example.com',
          phoneNumber: '010-1111-1111',
          academy: null,
          subject: null,
          school: null,
          schoolYear: null,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: new Date('2026-03-04T00:00:00.000Z'),
          hasActiveSession: true,
        },
        {
          profileId: 'assistant-boundary',
          instructorId: null,
          userId: 'user-boundary',
          userType: UserType.ASSISTANT,
          name: '경계 강사',
          email: 'boundary@example.com',
          phoneNumber: '010-2222-2222',
          academy: null,
          subject: null,
          school: null,
          schoolYear: null,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: new Date('2026-03-04T00:00:00.000Z'),
          hasActiveSession: false,
        },
        {
          profileId: 'student-inactive',
          instructorId: null,
          userId: 'user-inactive',
          userType: UserType.STUDENT,
          name: '비활성 강사',
          email: 'inactive@example.com',
          phoneNumber: '010-3333-3333',
          academy: null,
          subject: null,
          school: '테스트 학교',
          schoolYear: '3',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
          lastAccessAt: null,
          hasActiveSession: false,
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

    expect(result.totalCount).toBe(3);
    expect(result.users[0].activityStatus).toBe('active_30d');
    expect(result.users[1].activityStatus).toBe('active_30d');
    expect(result.users[2].activityStatus).toBe('inactive_30d');
  });
});
