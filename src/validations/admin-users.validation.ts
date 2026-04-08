import { z } from 'zod';
import { UserType } from '../constants/auth.constant.js';

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

export const getAdminUsersQuerySchema = z.object({
  keyword: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().min(1).optional(),
  ),
  userType: z
    .enum([
      'all',
      UserType.INSTRUCTOR,
      UserType.ASSISTANT,
      UserType.STUDENT,
      UserType.PARENT,
    ])
    .default('all'),
  activityStatus: z.enum(['all', 'active_30d', 'inactive_30d']).default('all'),
  sessionStatus: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const getAdminUserStatsQuerySchema = z.object({
  userType: z
    .enum([
      'all',
      UserType.INSTRUCTOR,
      UserType.ASSISTANT,
      UserType.STUDENT,
      UserType.PARENT,
    ])
    .default('all'),
});

export type GetAdminUsersQueryDto = z.infer<typeof getAdminUsersQuerySchema>;
export type GetAdminUserStatsQueryDto = z.infer<
  typeof getAdminUserStatsQuerySchema
>;
