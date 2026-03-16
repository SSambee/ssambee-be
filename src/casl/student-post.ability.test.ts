import { subject } from '@casl/ability';
import { defineStudentPostAbility } from './student-post.ability.js';
import { Action } from './actions.js';
import { UserType } from '../constants/auth.constant.js';
import { AuthorRole } from '../constants/posts.constant.js';

describe('StudentPost Ability', () => {
  describe('STUDENT 역할', () => {
    const ability = defineStudentPostAbility({
      userType: UserType.STUDENT,
      profileId: 'student-1',
      enrollmentIds: ['enrollment-1', 'enrollment-2'],
    });

    it('자기 enrollment의 STUDENT 글을 읽을 수 있다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(true);
    });

    it('타인 enrollment의 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'other-enrollment',
        authorRole: AuthorRole.STUDENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });

    it('PARENT가 작성한 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.PARENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });

    it('글을 삭제할 수 있다 (자기 enrollment)', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Delete, post)).toBe(true);
    });
  });

  describe('INSTRUCTOR 역할', () => {
    const ability = defineStudentPostAbility({
      userType: UserType.INSTRUCTOR,
      profileId: 'inst-1',
      effectiveInstructorId: 'inst-1',
    });

    it('담당 학생의 글을 읽을 수 있다', () => {
      const post = subject('StudentPost', {
        instructorId: 'inst-1',
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(true);
    });

    it('글을 수정/삭제할 수 없다', () => {
      const post = subject('StudentPost', {
        instructorId: 'inst-1',
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
      } as Record<string, unknown>);
      expect(ability.can(Action.Update, post)).toBe(false);
      expect(ability.can(Action.Delete, post)).toBe(false);
    });

    it('타 강사 담당 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        instructorId: 'other-inst',
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });
  });

  describe('ASSISTANT 역할', () => {
    const ability = defineStudentPostAbility({
      userType: UserType.ASSISTANT,
      profileId: 'assi-1',
      effectiveInstructorId: 'inst-1', // 조교가 담당하는 강사 ID
    });

    it('담당 강사의 글을 읽을 수 있다', () => {
      const post = subject('StudentPost', {
        instructorId: 'inst-1',
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(true);
    });

    it('타 강사 담당 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        instructorId: 'other-inst',
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });
  });

  describe('PARENT 역할', () => {
    const ability = defineStudentPostAbility({
      userType: UserType.PARENT,
      profileId: 'parent-1',
      parentEnrollmentIds: ['enrollment-1'],
    });

    it('자녀 enrollment의 PARENT 글을 읽을 수 있다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.PARENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(true);
    });

    it('자녀 enrollment의 STUDENT 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'enrollment-1',
        authorRole: AuthorRole.STUDENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });

    it('타인 자녀 enrollment의 글은 읽을 수 없다', () => {
      const post = subject('StudentPost', {
        enrollmentId: 'other-enrollment',
        authorRole: AuthorRole.PARENT,
        instructorId: 'inst-1',
      } as Record<string, unknown>);
      expect(ability.can(Action.Read, post)).toBe(false);
    });
  });
});
