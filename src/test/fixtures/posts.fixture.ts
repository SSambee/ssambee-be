import { fakerKO as faker } from '@faker-js/faker';
import { PostScope, TargetRole } from '../../constants/posts.constant.js';
import { mockInstructor, mockLectures } from './lectures.fixture.js';
import { mockMaterials } from './materials.fixture.js';

/** Mock InstructorPost 데이터 */
export const mockInstructorPosts = {
  global: {
    id: faker.string.uuid(),
    title: '전체 공지사항',
    content: '모든 학생에게 보이는 공지입니다.',
    scope: PostScope.GLOBAL,
    targetRole: TargetRole.ALL,
    isImportant: true,
    lectureId: null,
    instructorId: mockInstructor.id,
    authorAssistantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorRole: 'INSTRUCTOR',
    instructor: { user: { name: '이강사' } },
    authorAssistant: null,
    attachments: [],
    targets: [],
    comments: [],
    _count: { comments: 0 },
  },
  lecture: {
    id: faker.string.uuid(),
    title: '강의 공지사항',
    content: '특정 강의 학생들에게 보이는 공지입니다.',
    scope: PostScope.LECTURE,
    targetRole: TargetRole.ALL,
    isImportant: false,
    lectureId: mockLectures.basic.id,
    instructorId: mockInstructor.id,
    authorAssistantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorRole: 'INSTRUCTOR',
    instructor: { user: { name: '이강사' } },
    authorAssistant: null,
    attachments: [
      {
        id: faker.string.uuid(),
        instructorPostId: 'post-id',
        materialId: mockMaterials.basic.id,
        filename: mockMaterials.basic.title,
        fileUrl: null,
        createdAt: new Date(),
        material: mockMaterials.basic,
      },
    ],
    targets: [],
    comments: [],
    _count: { comments: 0 },
  },
  selected: {
    id: faker.string.uuid(),
    title: '선택 공지사항',
    content: '지정된 학생들에게만 보이는 공지입니다.',
    scope: PostScope.SELECTED,
    targetRole: TargetRole.ALL,
    isImportant: false,
    lectureId: null,
    instructorId: mockInstructor.id,
    authorAssistantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorRole: 'INSTRUCTOR',
    instructor: { user: { name: '이강사' } },
    authorAssistant: null,
    attachments: [],
    targets: [
      {
        id: faker.string.uuid(),
        instructorPostId: 'post-id',
        enrollmentId: 'enrollment-target',
        enrollment: {
          appStudentId: 'student-target-id',
          studentName: '대상학생',
        },
      },
    ],
    comments: [],
    _count: { comments: 0 },
  },
};

/** Mock StudentPost 데이터 */
export const mockStudentPosts = {
  basic: {
    id: faker.string.uuid(),
    status: 'PENDING',
    title: '질문 있습니다!',
    content: '이 부분이 이해가 안 가요.',
    createdAt: new Date(),
    updatedAt: new Date(),
    enrollmentId: 'enrollment-1',
    authorRole: 'STUDENT',
    instructorId: mockInstructor.id,
    lectureId: mockLectures.basic.id,
    enrollment: {
      appStudentId: 'student-1',
      studentName: '김학생',
      appStudent: { user: { name: '김학생' } },
      appParentLink: null,
    },
    comments: [],
    _count: { comments: 0 },
  },
};
