import {
  defineInstructorPostAbility,
  InstructorPostAbilityContext,
} from './instructor-post.ability';
import { UserType } from '../constants/auth.constant';
import { PostScope, TargetRole } from '../constants/posts.constant';
import { Action } from './actions';
import { subject } from '@casl/ability';
import { InstructorPost } from '../generated/prisma/client';

type InstructorPostWithTargets = InstructorPost & {
  targets: { enrollmentId: string }[];
};

describe('InstructorPost Ability', () => {
  describe('INSTRUCTOR', () => {
    it('자신의 게시글(Manage)에 대해 모든 권한을 가진다', () => {
      const context: InstructorPostAbilityContext = {
        userType: UserType.INSTRUCTOR,
        profileId: 'instructor-1',
        effectiveInstructorId: 'instructor-1',
      };
      const ability = defineInstructorPostAbility(context);

      const myPost = subject('InstructorPost', {
        instructorId: 'instructor-1',
      } as InstructorPost);
      const otherPost = subject('InstructorPost', {
        instructorId: 'instructor-2',
      } as InstructorPost);

      expect(ability.can(Action.Manage, myPost)).toBe(true);
      expect(ability.can(Action.Manage, otherPost)).toBe(false);
    });
  });

  describe('ASSISTANT', () => {
    it('담당 강사의 게시글에 대하여 읽기/생성/수정/삭제 등 조건부 권한을 검증한다', () => {
      const context: InstructorPostAbilityContext = {
        userType: UserType.ASSISTANT,
        profileId: 'assistant-1',
        effectiveInstructorId: 'instructor-1',
      };
      const ability = defineInstructorPostAbility(context);

      const myPost = subject('InstructorPost', {
        instructorId: 'instructor-1',
        authorAssistantId: 'assistant-1',
      } as InstructorPost);

      const instructorPost = subject('InstructorPost', {
        instructorId: 'instructor-1',
        authorAssistantId: null,
      } as InstructorPost);

      const otherPost = subject('InstructorPost', {
        instructorId: 'instructor-2',
      } as InstructorPost);

      // 본인이 담당하는 강사의 게시판에서는 Create, Read 가능
      expect(ability.can(Action.Read, instructorPost)).toBe(true);
      expect(ability.can(Action.Create, instructorPost)).toBe(true);

      // 본인이 작성한 게시글에 한해서만 수정/삭제 가능
      expect(ability.can(Action.Update, myPost)).toBe(true);
      expect(ability.can(Action.Delete, myPost)).toBe(true);

      // 강사가 쓴 게시글은 수정/삭제 불가
      expect(ability.can(Action.Update, instructorPost)).toBe(false);
      expect(ability.can(Action.Delete, instructorPost)).toBe(false);

      // 타 강사의 게시판은 아예 접근 불가
      expect(ability.can(Action.Read, otherPost)).toBe(false);
    });
  });

  describe('STUDENT', () => {
    const context: InstructorPostAbilityContext = {
      userType: UserType.STUDENT,
      profileId: 'student-1',
      studentFields: {
        instructorIds: ['instructor-1', 'instructor-2'],
        lectureIds: ['lecture-1'],
        enrollmentIds: ['enrollment-1'],
      },
    };

    it('ALL 또는 STUDENT 타겟이면서, 수강 중인 강사의 GLOBAL 공지를 조회할 수 있다', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost1 = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.ALL,
        instructorId: 'instructor-1',
      } as InstructorPost);

      const successPost2 = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.STUDENT,
        instructorId: 'instructor-1',
      } as InstructorPost);

      const failPostRole = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.PARENT,
        instructorId: 'instructor-1',
      } as InstructorPost);

      const failPostInstructor = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.ALL,
        instructorId: 'instructor-other',
      } as InstructorPost);

      expect(ability.can(Action.Read, successPost1)).toBe(true);
      expect(ability.can(Action.Read, successPost2)).toBe(true);
      expect(ability.can(Action.Read, failPostRole)).toBe(false);
      expect(ability.can(Action.Read, failPostInstructor)).toBe(false);
    });

    it('수강 중인 강의(LECTURE)의 공지를 조회할 수 있다', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost = subject('InstructorPost', {
        scope: PostScope.LECTURE,
        targetRole: TargetRole.ALL,
        lectureId: 'lecture-1',
      } as InstructorPost);

      const failPostLecture = subject('InstructorPost', {
        scope: PostScope.LECTURE,
        targetRole: TargetRole.ALL,
        lectureId: 'lecture-other',
      } as InstructorPost);

      expect(ability.can(Action.Read, successPost)).toBe(true);
      expect(ability.can(Action.Read, failPostLecture)).toBe(false);
    });

    it('타겟(SELECTED) 공지에 본인의 수강ID(enrollmentId)가 포함되어 있으면 조회할 수 있다', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost = subject('InstructorPost', {
        scope: PostScope.SELECTED,
        targetRole: TargetRole.ALL,
        targets: [{ enrollmentId: 'enrollment-1' }],
      } as unknown as InstructorPostWithTargets);

      const failPost = subject('InstructorPost', {
        scope: PostScope.SELECTED,
        targetRole: TargetRole.ALL,
        targets: [{ enrollmentId: 'enrollment-other' }],
      } as unknown as InstructorPostWithTargets);

      expect(ability.can(Action.Read, successPost)).toBe(true);
      expect(ability.can(Action.Read, failPost)).toBe(false);
    });
  });

  describe('PARENT', () => {
    const context: InstructorPostAbilityContext = {
      userType: UserType.PARENT,
      profileId: 'parent-1',
      parentFields: {
        instructorIds: ['instructor-1'],
        lectureIds: ['lecture-1'],
        enrollmentIds: ['enrollment-1'],
      },
    };

    it('ALL 또는 PARENT 타겟이면서, 자녀가 수강 중인 강사의 GLOBAL 공지만 조회할 수 있다', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.PARENT,
        instructorId: 'instructor-1',
      } as InstructorPost);

      const failPostRole = subject('InstructorPost', {
        scope: PostScope.GLOBAL,
        targetRole: TargetRole.STUDENT,
        instructorId: 'instructor-1',
      } as InstructorPost);

      expect(ability.can(Action.Read, successPost)).toBe(true);
      expect(ability.can(Action.Read, failPostRole)).toBe(false);
    });

    it('보호자(PARENT) 타겟 LECTURE 공지에 자녀가 속해있으면 조회 가능', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost = subject('InstructorPost', {
        scope: PostScope.LECTURE,
        targetRole: TargetRole.PARENT,
        lectureId: 'lecture-1',
      } as InstructorPost);

      expect(ability.can(Action.Read, successPost)).toBe(true);
    });

    it('보호자(PARENT) 타겟 SELECTED 공지에 자녀가 지정되어있으면 조회 가능', () => {
      const ability = defineInstructorPostAbility(context);

      const successPost = subject('InstructorPost', {
        scope: PostScope.SELECTED,
        targetRole: TargetRole.PARENT,
        targets: [{ enrollmentId: 'enrollment-1' }],
      } as unknown as InstructorPostWithTargets);

      expect(ability.can(Action.Read, successPost)).toBe(true);
    });
  });
});
