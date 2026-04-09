import { subDays } from 'date-fns';
import type {
  AdminUsersRepository,
  AdminUserListRow,
} from '../repos/admin-users.repo.js';
import type {
  GetAdminUsersQueryDto,
  GetAdminUserStatsQueryDto,
} from '../validations/admin-users.validation.js';

export class AdminUsersService {
  constructor(private readonly adminUsersRepo: AdminUsersRepository) {}

  async listUsers(query: GetAdminUsersQueryDto) {
    const now = new Date();
    const activeSince = subDays(now, 30);
    const result = await this.adminUsersRepo.listUsers(query, {
      now,
      activeSince,
    });

    return {
      totalCount: result.totalCount,
      users: result.users.map((user) =>
        this.toAdminUserListItem(user, activeSince),
      ),
    };
  }

  async getUserStats(query: GetAdminUserStatsQueryDto) {
    const now = new Date();
    const activeSince = subDays(now, 30);

    return this.adminUsersRepo.getUserStats(query, {
      now,
      activeSince,
    });
  }

  private toAdminUserListItem(
    user: AdminUserListRow,
    activeSince: Date,
  ): AdminUserListRow & {
    activityStatus: 'active_30d' | 'inactive_30d';
  } {
    return {
      ...user,
      activityStatus:
        user.lastAccessAt && user.lastAccessAt >= activeSince
          ? 'active_30d'
          : 'inactive_30d',
    };
  }
}
