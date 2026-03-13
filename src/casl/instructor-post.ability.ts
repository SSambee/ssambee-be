import { AbilityBuilder } from '@casl/ability';
import { createPrismaAbility } from '@casl/prisma';
import { Action as A } from './actions.js';
import type { UserType } from '../constants/auth.constant.js';
import { UserType as UT } from '../constants/auth.constant.js';
import { PostScope, TargetRole } from '../constants/posts.constant.js';
import type { AppAbility } from './ability.types.js';

export interface InstructorPostAbilityContext {
  userType: UserType;
  profileId: string;
  effectiveInstructorId?: string;
  studentFields?: {
    lectureIds: string[];
    instructorIds: string[];
    enrollmentIds: string[];
  };
  parentFields?: {
    lectureIds: string[];
    instructorIds: string[];
    enrollmentIds: string[];
  };
}

export function defineInstructorPostAbility(
  ctx: InstructorPostAbilityContext,
): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

  switch (ctx.userType) {
    case UT.INSTRUCTOR: {
      if (ctx.effectiveInstructorId) {
        can(A.Manage, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
        });
      }
      break;
    }

    case UT.ASSISTANT: {
      if (ctx.effectiveInstructorId) {
        // 소속 강사의 모든 게시글 조회 가능
        can(A.Read, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
        });
        can(A.List, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
        });

        // 소속 강사의 이름으로 게시글 작성 가능
        can(A.Create, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
        });

        // 본인이 작성한 게시글만 수정/삭제 가능
        can(A.Update, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
          authorAssistantId: ctx.profileId,
        });
        can(A.Delete, 'InstructorPost', {
          instructorId: ctx.effectiveInstructorId,
          authorAssistantId: ctx.profileId,
        });
      }
      break;
    }

    case UT.STUDENT: {
      if (ctx.studentFields) {
        const { lectureIds, instructorIds, enrollmentIds } = ctx.studentFields;
        const targetRoles = [TargetRole.ALL, TargetRole.STUDENT];

        // 1. GLOBAL: 내가 수강 중인 강사의 전체 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.GLOBAL,
          instructorId: { in: instructorIds },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.GLOBAL,
          instructorId: { in: instructorIds },
        });

        // 2. LECTURE: 내가 수강 중인 강의의 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.LECTURE,
          lectureId: { in: lectureIds },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.LECTURE,
          lectureId: { in: lectureIds },
        });

        // 3. SELECTED: 내가 타겟으로 지정된 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.SELECTED,
          targets: { some: { enrollmentId: { in: enrollmentIds } } },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.SELECTED,
          targets: { some: { enrollmentId: { in: enrollmentIds } } },
        });
      }
      break;
    }

    case UT.PARENT: {
      if (ctx.parentFields) {
        const { lectureIds, instructorIds, enrollmentIds } = ctx.parentFields;
        const targetRoles = [TargetRole.ALL, TargetRole.PARENT];

        // 1. GLOBAL: 자녀가 수강 중인 강사의 전체 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.GLOBAL,
          instructorId: { in: instructorIds },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.GLOBAL,
          instructorId: { in: instructorIds },
        });

        // 2. LECTURE: 자녀가 수강 중인 강의의 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.LECTURE,
          lectureId: { in: lectureIds },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.LECTURE,
          lectureId: { in: lectureIds },
        });

        // 3. SELECTED: 자녀가 타겟으로 지정된 공지
        can(A.Read, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.SELECTED,
          targets: { some: { enrollmentId: { in: enrollmentIds } } },
        });
        can(A.List, 'InstructorPost', {
          targetRole: { in: targetRoles },
          scope: PostScope.SELECTED,
          targets: { some: { enrollmentId: { in: enrollmentIds } } },
        });
      }
      break;
    }
  }

  return build();
}
