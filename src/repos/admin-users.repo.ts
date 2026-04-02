import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { UserType } from '../constants/auth.constant.js';
import type { GetAdminUsersQueryDto } from '../validations/admin-users.validation.js';

export interface AdminUserListRow {
  instructorId: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  academy: string | null;
  subject: string | null;
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

interface InstructorUserQueryContext {
  now: Date;
  activeSince: Date;
}

export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listInstructorUsers(
    query: GetAdminUsersQueryDto,
    context: InstructorUserQueryContext,
  ) {
    const skip = (query.page - 1) * query.limit;
    const baseCte = this.buildBaseCte(query.keyword, context);
    const derivedWhere = this.buildDerivedWhere(query, context.activeSince);

    const [users, countRows] = await Promise.all([
      this.prisma.$queryRaw<AdminUserListRow[]>(Prisma.sql`
        ${baseCte}
        SELECT
          base."instructorId",
          base."userId",
          base."name",
          base."email",
          base."phoneNumber",
          base."academy",
          base."subject",
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

  async getInstructorUserStats(context: InstructorUserQueryContext) {
    const rows = await this.prisma.$queryRaw<AdminUserStatsRow[]>(Prisma.sql`
      ${this.buildBaseCte(undefined, context)}
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
    keyword: string | undefined,
    context: InstructorUserQueryContext,
  ) {
    const keywordCondition = keyword
      ? Prisma.sql`
          AND (
            u.name ILIKE ${`%${keyword}%`}
            OR u.email ILIKE ${`%${keyword}%`}
            OR i.phone_number ILIKE ${`%${keyword}%`}
          )
        `
      : Prisma.empty;

    return Prisma.sql`
      WITH base AS (
        SELECT
          i.id AS "instructorId",
          u.id AS "userId",
          u.name AS "name",
          u.email AS "email",
          i.phone_number AS "phoneNumber",
          i.academy AS "academy",
          i.subject AS "subject",
          u.created_at AS "createdAt",
          MAX(s.updated_at) AS "lastAccessAt",
          COALESCE(BOOL_OR(s.expires_at > ${context.now}), FALSE) AS "hasActiveSession"
        FROM "instructors" i
        INNER JOIN "user" u
          ON u.id = i.user_id
        LEFT JOIN "session" s
          ON s.user_id = u.id
        WHERE i.deleted_at IS NULL
          AND u.user_type = ${UserType.INSTRUCTOR}
          ${keywordCondition}
        GROUP BY
          i.id,
          u.id,
          u.name,
          u.email,
          i.phone_number,
          i.academy,
          i.subject,
          u.created_at
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
}
