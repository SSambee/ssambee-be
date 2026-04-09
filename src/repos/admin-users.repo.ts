import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import type {
  GetAdminUsersQueryDto,
  GetAdminUserStatsQueryDto,
} from '../validations/admin-users.validation.js';

export interface AdminUserListRow {
  profileId: string;
  instructorId: string | null;
  userId: string;
  userType: UserType;
  name: string;
  email: string;
  phoneNumber: string | null;
  academy: string | null;
  subject: string | null;
  school: string | null;
  schoolYear: string | null;
  createdAt: Date;
  lastAccessAt: Date | null;
  hasActiveSession: boolean;
}

export interface AdminUserStatsRow {
  totalCount: number;
  active30dCount: number;
  inactive30dCount: number;
  activeSessionCount: number;
}

interface AdminUserQueryContext {
  now: Date;
  activeSince: Date;
}

const LISTABLE_USER_TYPES = [
  UserType.INSTRUCTOR,
  UserType.ASSISTANT,
  UserType.STUDENT,
  UserType.PARENT,
] as const;

export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listUsers(
    query: GetAdminUsersQueryDto,
    context: AdminUserQueryContext,
  ) {
    const skip = (query.page - 1) * query.limit;
    const baseCte = this.buildBaseCte(query, context);
    const derivedWhere = this.buildDerivedWhere(query, context.activeSince);

    const [users, countRows] = await Promise.all([
      this.prisma.$queryRaw<AdminUserListRow[]>(Prisma.sql`
        ${baseCte}
        SELECT
          base."profileId",
          base."instructorId",
          base."userId",
          base."userType",
          base."name",
          base."email",
          base."phoneNumber",
          base."academy",
          base."subject",
          base."school",
          base."schoolYear",
          base."createdAt",
          base."lastAccessAt",
          base."hasActiveSession"
        FROM base
        ${derivedWhere}
        ORDER BY base."lastAccessAt" DESC NULLS LAST, base."createdAt" DESC
        LIMIT ${query.limit}
        OFFSET ${skip}
      `),
      this.prisma.$queryRaw<Array<{ totalCount: number }>>(Prisma.sql`
        ${baseCte}
        SELECT COUNT(*)::int AS "totalCount"
        FROM base
        ${derivedWhere}
      `),
    ]);

    return {
      users,
      totalCount: countRows[0]?.totalCount ?? 0,
    };
  }

  async getUserStats(
    query: GetAdminUserStatsQueryDto,
    context: AdminUserQueryContext,
  ) {
    const rows = await this.prisma.$queryRaw<AdminUserStatsRow[]>(Prisma.sql`
      ${this.buildBaseCte(query, context)}
      SELECT
        COUNT(*)::int AS "totalCount",
        COUNT(*) FILTER (
          WHERE base."lastAccessAt" >= ${context.activeSince}
        )::int AS "active30dCount",
        COUNT(*) FILTER (
          WHERE base."lastAccessAt" < ${context.activeSince}
             OR base."lastAccessAt" IS NULL
        )::int AS "inactive30dCount",
        COUNT(*) FILTER (
          WHERE base."hasActiveSession" = TRUE
        )::int AS "activeSessionCount"
      FROM base
    `);

    return (
      rows[0] ?? {
        totalCount: 0,
        active30dCount: 0,
        inactive30dCount: 0,
        activeSessionCount: 0,
      }
    );
  }

  private buildBaseCte(
    query:
      | Pick<GetAdminUsersQueryDto, 'keyword' | 'userType'>
      | GetAdminUserStatsQueryDto,
    context: AdminUserQueryContext,
  ) {
    const keyword = 'keyword' in query ? query.keyword : undefined;
    const keywordCondition =
      'keyword' in query && query.keyword
        ? Prisma.sql`
          AND (
            u.name ILIKE ${`%${keyword}%`}
            OR u.email ILIKE ${`%${keyword}%`}
            OR COALESCE(
              i.phone_number,
              a.phone_number,
              st.phone_number,
              p.phone_number,
              ''
            ) ILIKE ${`%${keyword}%`}
            OR COALESCE(i.academy, '') ILIKE ${`%${keyword}%`}
            OR COALESCE(i.subject, '') ILIKE ${`%${keyword}%`}
            OR COALESCE(st.school, '') ILIKE ${`%${keyword}%`}
            OR COALESCE(st.school_year, '') ILIKE ${`%${keyword}%`}
          )
        `
        : Prisma.empty;
    const userTypes = this.resolveUserTypes(query.userType);
    const userTypeCondition = Prisma.sql`
      u.user_type IN (${Prisma.join(userTypes.map((userType) => Prisma.sql`${userType}`))})
    `;

    return Prisma.sql`
      WITH base AS (
        SELECT
          COALESCE(i.id, a.id, st.id, p.id) AS "profileId",
          CASE
            WHEN u.user_type = ${UserType.INSTRUCTOR} THEN i.id
            ELSE NULL
          END AS "instructorId",
          u.id AS "userId",
          u.user_type AS "userType",
          u.name AS "name",
          u.email AS "email",
          COALESCE(
            i.phone_number,
            a.phone_number,
            st.phone_number,
            p.phone_number
          ) AS "phoneNumber",
          i.academy AS "academy",
          i.subject AS "subject",
          st.school AS "school",
          st.school_year AS "schoolYear",
          u.created_at AS "createdAt",
          MAX(s.updated_at) AS "lastAccessAt",
          COALESCE(BOOL_OR(s.expires_at > ${context.now}), FALSE) AS "hasActiveSession"
        FROM "user" u
        LEFT JOIN "instructors" i
          ON i.user_id = u.id
         AND i.deleted_at IS NULL
        LEFT JOIN "assistants" a
          ON a.user_id = u.id
         AND a.deleted_at IS NULL
        LEFT JOIN "app_students" st
          ON st.user_id = u.id
        LEFT JOIN "app_parents" p
          ON p.user_id = u.id
        LEFT JOIN "session" s
          ON s.user_id = u.id
        WHERE ${userTypeCondition}
          AND (
            (u.user_type = ${UserType.INSTRUCTOR} AND i.id IS NOT NULL)
            OR (u.user_type = ${UserType.ASSISTANT} AND a.id IS NOT NULL)
            OR (u.user_type = ${UserType.STUDENT} AND st.id IS NOT NULL)
            OR (u.user_type = ${UserType.PARENT} AND p.id IS NOT NULL)
          )
          ${keywordCondition}
        GROUP BY
          u.id,
          u.user_type,
          u.name,
          u.email,
          u.created_at,
          i.id,
          i.phone_number,
          i.academy,
          i.subject,
          a.id,
          a.phone_number,
          st.id,
          st.phone_number,
          st.school,
          st.school_year,
          p.id,
          p.phone_number
      )
    `;
  }

  private buildDerivedWhere(
    query: Pick<GetAdminUsersQueryDto, 'activityStatus' | 'sessionStatus'>,
    activeSince: Date,
  ) {
    const conditions: Prisma.Sql[] = [];

    if (query.activityStatus === 'active_30d') {
      conditions.push(Prisma.sql`base."lastAccessAt" >= ${activeSince}`);
    }

    if (query.activityStatus === 'inactive_30d') {
      conditions.push(
        Prisma.sql`(
          base."lastAccessAt" < ${activeSince}
          OR base."lastAccessAt" IS NULL
        )`,
      );
    }

    if (query.sessionStatus === 'active') {
      conditions.push(Prisma.sql`base."hasActiveSession" = TRUE`);
    }

    if (query.sessionStatus === 'inactive') {
      conditions.push(Prisma.sql`base."hasActiveSession" = FALSE`);
    }

    if (conditions.length === 0) {
      return Prisma.empty;
    }

    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private resolveUserTypes(userType: GetAdminUsersQueryDto['userType']) {
    return userType === 'all' ? LISTABLE_USER_TYPES : [userType];
  }
}
