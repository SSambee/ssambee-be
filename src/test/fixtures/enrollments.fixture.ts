import { fakerKO as faker } from '@faker-js/faker';
import type {
  Enrollment,
  AppStudent,
  AppParent,
  Assistant,
} from '../../generated/prisma/client.js';
import { EnrollmentStatus } from '../../constants/enrollments.constant.js';
import { mockUsers } from './user.fixture.js';
import { mockInstructor, mockLectures } from './lectures.fixture.js';

/** Mock AppStudent 데이터 */
export const mockStudents = {
  basic: {
    id: faker.string.uuid(),
    userId: mockUsers.student.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    school: faker.helpers.arrayElement([
      '서울고등학교',
      '강남고등학교',
      '서초고등학교',
    ]),
    schoolYear: '고1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as AppStudent,

  withParentLink: {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    school: '서울고등학교',
    schoolYear: '고2',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as AppStudent,

  another: {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    school: '강남고등학교',
    schoolYear: '고1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as AppStudent,
};

/** Mock AppParent 데이터 */
export const mockParents = {
  basic: {
    id: faker.string.uuid(),
    userId: mockUsers.parent.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as AppParent,

  another: {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as AppParent,
};

/** Mock ParentChildLink 데이터 */
export const mockParentLinks = {
  active: {
    id: faker.string.uuid(),
    appParentId: mockParents.basic.id,
    phoneNumber: mockStudents.basic.phoneNumber,
    name: mockStudents.basic.schoolYear + ' ' + faker.person.fullName(),
    createdAt: new Date('2024-01-01'),
    parent: {
      id: 'parent-id-001',
      userId: 'user-parent-id-001',
      phoneNumber: '010-3333-4444',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    updatedAt: new Date('2024-01-01'),
  },

  another: {
    id: faker.string.uuid(),
    appParentId: mockParents.another.id,
    phoneNumber: mockStudents.withParentLink.phoneNumber,
    name:
      mockStudents.withParentLink.schoolYear + ' ' + faker.person.fullName(),
    createdAt: new Date('2024-01-01'),
    parent: {
      id: 'parent-id-002',
      userId: 'user-parent-id-002',
      phoneNumber: '010-7777-8888',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    updatedAt: new Date('2024-01-01'),
  },
};

/** Mock Assistant 데이터 */
export const mockAssistants = {
  basic: {
    id: faker.string.uuid(),
    userId: mockUsers.assistant.id,
    instructorId: mockInstructor.id,
    phoneNumber: faker.phone.number({ style: 'national' }),
    signupCode: null,
    contract: null,
    createdAt: new Date('2024-01-01'),
  } as Assistant,

  otherInstructor: {
    id: faker.string.uuid(),
    userId: faker.string.uuid(),
    instructorId: faker.string.uuid(),
    phoneNumber: faker.phone.number({ style: 'national' }),
    signupCode: null,
    contract: null,
    createdAt: new Date('2024-01-01'),
  } as Assistant,
};

/** Mock Enrollment 데이터 */
export const mockEnrollments = {
  active: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    appStudentId: mockStudents.basic.id,
    appParentLinkId: mockParentLinks.active.id,
    studentName: faker.person.fullName(),
    school: mockStudents.basic.school,
    schoolYear: mockStudents.basic.schoolYear,
    studentPhone: mockStudents.basic.phoneNumber,
    parentPhone: mockParents.basic.phoneNumber,
    status: EnrollmentStatus.ACTIVE,
    registeredAt: new Date('2024-02-01'),
    memo: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as Enrollment,

  withoutParentLink: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    appStudentId: mockStudents.withParentLink.id,
    appParentLinkId: null,
    studentName: faker.person.fullName(),
    school: mockStudents.withParentLink.school,
    schoolYear: mockStudents.withParentLink.schoolYear,
    studentPhone: mockStudents.withParentLink.phoneNumber,
    parentPhone: faker.phone.number({ style: 'national' }),
    status: EnrollmentStatus.ACTIVE,
    registeredAt: new Date('2024-02-01'),
    memo: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as Enrollment,

  deleted: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    appStudentId: mockStudents.another.id,
    appParentLinkId: null,
    studentName: faker.person.fullName(),
    school: mockStudents.another.school,
    schoolYear: mockStudents.another.schoolYear,
    studentPhone: mockStudents.another.phoneNumber,
    parentPhone: faker.phone.number({ style: 'national' }),
    status: EnrollmentStatus.ACTIVE,
    registeredAt: new Date('2024-02-01'),
    memo: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: new Date('2024-03-01'),
  } as Enrollment,

  otherInstructor: {
    id: faker.string.uuid(),
    instructorId: mockLectures.otherInstructor.instructorId,
    appStudentId: mockStudents.another.id,
    appParentLinkId: null,
    studentName: faker.person.fullName(),
    school: mockStudents.another.school,
    schoolYear: mockStudents.another.schoolYear,
    studentPhone: mockStudents.another.phoneNumber,
    parentPhone: faker.phone.number({ style: 'national' }),
    status: EnrollmentStatus.ACTIVE,
    registeredAt: new Date('2024-02-01'),
    memo: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as Enrollment,

  withMemo: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    appStudentId: null,
    appParentLinkId: null,
    studentName: faker.person.fullName(),
    school: '서울고등학교',
    schoolYear: '고3',
    studentPhone: faker.phone.number({ style: 'national' }),
    parentPhone: faker.phone.number({ style: 'national' }),
    status: EnrollmentStatus.ACTIVE,
    registeredAt: new Date('2024-02-01'),
    memo: faker.lorem.sentence(),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
  } as Enrollment,
};

/** 수강 등록 요청 DTO */
export const createEnrollmentRequests = {
  basic: {
    studentName: faker.person.fullName(),
    school: '서울고등학교',
    schoolYear: '고1',
    studentPhone: faker.phone.number({ style: 'national' }),
    parentPhone: faker.phone.number({ style: 'national' }),
  },

  withParentLink: {
    studentName: faker.person.fullName(),
    school: '강남고등학교',
    schoolYear: '고2',
    studentPhone: faker.phone.number({ style: 'national' }),
    parentPhone: faker.phone.number({ style: 'national' }),
    appParentLinkId: mockParentLinks.active.id,
  },

  withMemo: {
    studentName: faker.person.fullName(),
    school: '서울고등학교',
    schoolYear: '고3',
    studentPhone: faker.phone.number({ style: 'national' }),
    parentPhone: faker.phone.number({ style: 'national' }),
    memo: faker.lorem.sentence(),
  },
};

/** 수강 정보 수정 요청 DTO */
export const updateEnrollmentRequests = {
  full: {
    studentName: faker.person.fullName() + ' (수정)',
    school: '강남고등학교',
    schoolYear: '고2',
    studentPhone: faker.phone.number({ style: 'national' }),
    parentPhone: faker.phone.number({ style: 'national' }),
    memo: faker.lorem.sentence(),
    status: EnrollmentStatus.ACTIVE,
  },

  partial: {
    memo: faker.lorem.sentence(),
  },

  statusChange: {
    status: EnrollmentStatus.DROPPED,
  },
};

/** Enrollment with Relations (조회 시 사용) */
export const mockEnrollmentWithRelations = {
  ...mockEnrollments.active,
  lectureEnrollments: [
    {
      id: faker.string.uuid(),
      enrollmentId: mockEnrollments.active.id,
      lectureId: mockLectures.basic.id,
      registeredAt: new Date(),
      lecture: {
        ...mockLectures.basic,
        instructor: {
          ...mockInstructor,
          user: {
            name: mockUsers.instructor.name,
          },
        },
      },
    },
  ],
};

/** Enrollment with Relations (학부모용 - 간소화된 관계) */
export const mockEnrollmentWithRelationsForParent = {
  ...mockEnrollments.active,
};

/** Mock Enrollment 배열 (목록 조회용) */
export const mockEnrollmentsList = [
  { ...mockEnrollments.active, attendances: [] },
  { ...mockEnrollments.withoutParentLink, attendances: [] },
  { ...mockEnrollments.withMemo, attendances: [] },
];

/** Mock Query DTO */
export const mockEnrollmentQueries = {
  withPagination: {
    page: 1,
    limit: 10,
  },

  withFilters: {
    page: 1,
    limit: 10,
    status: EnrollmentStatus.ACTIVE,
    lectureId: mockLectures.basic.id,
  },
};
