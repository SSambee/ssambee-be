import { fakerKO as faker } from '@faker-js/faker';
import type { StudentPostsRepository } from '../../repos/student-posts.repo.js';
import type { CommentsRepository } from '../../repos/comments.repo.js';
import {
  StudentPostStatus,
  AuthorRole,
} from '../../constants/posts.constant.js';

/**
 * mockComment가 반환할 상세 타입 정의
 * Repository의 리턴 타입을 직접 참조하여 가장 정확한 타입을 보장합니다.
 */
export type MockCommentDetail = Exclude<
  Awaited<ReturnType<CommentsRepository['create']>>,
  null | undefined
>;

/**
 * mockStudentPost가 반환할 상세 타입 정의
 * Repository의 리턴 타입을 직접 참조하여 가장 정확한 타입을 보장합니다.
 */
export type MockStudentPostDetail = Exclude<
  Awaited<ReturnType<StudentPostsRepository['findById']>>,
  null | undefined
>;

/** Mock StudentPost 데이터 */
export const mockStudentPost = (
  overrides: Partial<MockStudentPostDetail> = {},
): MockStudentPostDetail => {
  const post = {
    id: faker.string.uuid(),
    status: StudentPostStatus.PENDING,
    title: faker.lorem.sentence(),
    content: faker.lorem.paragraphs(),
    createdAt: new Date(),
    updatedAt: new Date(),
    enrollmentId: faker.string.uuid(),
    authorRole: AuthorRole.STUDENT,
    instructorId: faker.string.uuid(),
    lectureId: faker.string.uuid(),
    enrollment: {
      appStudentId: faker.string.uuid(),
      studentName: faker.person.fullName(),
      appStudent: { user: { name: faker.person.fullName() } },
      appParentLink: { name: faker.person.fullName() },
    },
    comments: [],
    ...overrides,
  };
  return post as unknown as MockStudentPostDetail;
};

/** Mock Comment 데이터 */
export const mockComment = (
  overrides: Partial<MockCommentDetail> = {},
): MockCommentDetail => {
  const comment = {
    id: faker.string.uuid(),
    content: faker.lorem.sentence(),
    createdAt: new Date(),
    updatedAt: new Date(),
    instructorPostId: null,
    studentPostId: faker.string.uuid(),
    instructorId: null,
    assistantId: null,
    enrollmentId: faker.string.uuid(),
    instructor: { user: { name: faker.person.fullName() } },
    assistant: { user: { name: faker.person.fullName() } },
    enrollment: { studentName: faker.person.fullName() },
    attachments: [],
    ...overrides,
  };
  return comment as unknown as MockCommentDetail;
};
