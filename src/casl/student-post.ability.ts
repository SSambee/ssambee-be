import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';
import { Action as A } from './actions.js';
import type { UserType } from '../constants/auth.constant.js';
import { UserType as UT } from '../constants/auth.constant.js';
import { AuthorRole } from '../constants/posts.constant.js';
import type { AppAbility } from './ability.types.js';

export interface AbilityContext {
  userType: UserType;
  profileId: string;
  enrollmentIds?: string[];
  effectiveInstructorId?: string;
  parentEnrollmentIds?: string[];
}

export function defineStudentPostAbility(ctx: AbilityContext): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

  switch (ctx.userType) {
    case UT.STUDENT: {
      const condition = {
        enrollmentId: { in: ctx.enrollmentIds ?? [] },
        authorRole: AuthorRole.STUDENT,
      };
      can(A.Create, 'StudentPost', condition);
      can(A.Read, 'StudentPost', condition);
      can(A.Update, 'StudentPost', condition);
      can(A.Delete, 'StudentPost', condition);
      can(A.UpdateStatus, 'StudentPost', condition);
      can(A.List, 'StudentPost', condition);
      break;
    }

    case UT.INSTRUCTOR: {
      if (!ctx.effectiveInstructorId) {
        // Retrun empty ability - no permissions granted
        break;
      }
      const condition = { instructorId: ctx.effectiveInstructorId };
      can(A.Read, 'StudentPost', condition);
      can(A.List, 'StudentPost', condition);
      break;
    }

    case UT.ASSISTANT: {
      if (!ctx.effectiveInstructorId) {
        break;
      }
      const condition = { instructorId: ctx.effectiveInstructorId };
      can(A.Read, 'StudentPost', condition);
      can(A.List, 'StudentPost', condition);
      break;
    }

    case UT.PARENT: {
      const condition = {
        enrollmentId: { in: ctx.parentEnrollmentIds ?? [] },
        authorRole: AuthorRole.PARENT,
      };
      can(A.Create, 'StudentPost', condition);
      can(A.Read, 'StudentPost', condition);
      can(A.Update, 'StudentPost', condition);
      can(A.Delete, 'StudentPost', condition);
      can(A.UpdateStatus, 'StudentPost', condition);
      can(A.List, 'StudentPost', condition);
      break;
    }
  }

  return build();
}
