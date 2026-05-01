import { subDays } from 'date-fns';
import { UserType } from '../constants/auth.constant.js';
import type {
  AdminUsersRepository,
  AdminUserListRow,
} from '../repos/admin-users.repo.js';
import type {
  GetAdminUsersQueryDto,
  GetAdminUserStatsQueryDto,
} from '../validations/admin-users.validation.js';

type AdminUserActivityStatus = 'active_30d' | 'inactive_30d';

type AdminUserProfile =
  | {
      academy: string | null;
      subject: string | null;
    }
  | {
      instructorId: string | null;
      instructorName: string | null;
      signStatus: string | null;
    }
  | {
      school: string | null;
      schoolYear: string | null;
      parentPhoneNumber: string | null;
    }
  | {
      childCount: number;
    };

export interface AdminUserListItem {
  profileId: string;
  userId: string;
  userType: UserType;
  name: string;
  email: string;
  phoneNumber: string | null;
  createdAt: Date;
  lastAccessAt: Date | null;
  hasActiveSession: boolean;
  activityStatus: AdminUserActivityStatus;
  profile: AdminUserProfile;
}

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
  ): AdminUserListItem {
    return {
      profileId: user.profileId,
      userId: user.userId,
      userType: user.userType,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
      lastAccessAt: user.lastAccessAt,
      hasActiveSession: user.hasActiveSession,
      activityStatus:
        user.lastAccessAt && user.lastAccessAt >= activeSince
          ? 'active_30d'
          : 'inactive_30d',
      profile: this.toAdminUserProfile(user),
    };
  }

  private toAdminUserProfile(user: AdminUserListRow): AdminUserProfile {
    switch (user.userType) {
      case UserType.INSTRUCTOR:
        return {
          academy: user.instructorAcademy,
          subject: user.instructorSubject,
        };
      case UserType.ASSISTANT:
        return {
          instructorId: user.assistantInstructorId,
          instructorName: user.assistantInstructorName,
          signStatus: user.assistantSignStatus,
        };
      case UserType.STUDENT:
        return {
          school: user.studentSchool,
          schoolYear: user.studentSchoolYear,
          parentPhoneNumber: user.studentParentPhoneNumber,
        };
      case UserType.PARENT:
        return {
          childCount: user.parentChildCount,
        };
      default:
        throw new Error(`Unsupported user type: ${user.userType}`);
    }
  }
}
