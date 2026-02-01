import { fakerKO as faker } from '@faker-js/faker';
import type { Instructor } from '../../generated/prisma/client.js';
import { LectureStatus } from '../../constants/lectures.constant.js';
import { mockProfiles } from './profile.fixture.js';
import { mockUsers } from './user.fixture.js';
import type { LectureDetail } from '../../repos/lectures.repo.js';

/** Mock Instructor 데이터 */
export const mockInstructor: Instructor = {
  ...mockProfiles.instructor,
} as Instructor;

/** Mock Instructor with User 데이터 (Repo findMany 응답용) */
export const mockInstructorWithUser = {
  user: {
    name: mockUsers.instructor.name,
  },
};

/** Mock Lecture 데이터 */
export const mockLectures: Record<string, LectureDetail> = {
  /** 기본 강의 */
  basic: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    title: faker.commerce.productName() + ' 강의',
    subject: faker.helpers.arrayElement(['국어', '영어', '수학']),
    description: faker.commerce.productDescription(),
    startAt: new Date('2024-03-01'),
    endAt: new Date('2024-06-30'),
    status: LectureStatus.IN_PROGRESS,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    lectureTimes: [],
    instructor: mockInstructorWithUser,
    enrollments: [],
    exams: [],
    _count: { enrollments: 0 },
  },

  /** Enrollments와 함께 생성될 강의 */
  withEnrollments: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    title: faker.commerce.productName() + ' 심화 강의',
    subject: faker.helpers.arrayElement(['국어', '영어', '수학']),
    description: faker.commerce.productDescription(),
    startAt: faker.date.soon(),
    endAt: faker.date.future(),
    status: LectureStatus.SCHEDULED,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
    lectureTimes: [],
    instructor: mockInstructorWithUser,
    enrollments: [
      {
        id: faker.string.uuid(),
        studentName: faker.person.fullName(),
        studentPhone: faker.phone.number({ style: 'national' }),
        parentPhone: faker.phone.number({ style: 'national' }),
        school: `${faker.location.city()}고등학교`,
        schoolYear: faker.helpers.arrayElement(['1', '2', '3']),
        studentAnswers: [],
        appStudentId: null,
        appParentLinkId: null,
        lectureId: faker.string.uuid(),
        instructorId: faker.string.uuid(),
        registeredAt: faker.date.recent(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        status: 'ACTIVE',
        memo: null,
        deletedAt: null,
      },
      {
        id: faker.string.uuid(),
        studentName: faker.person.fullName(),
        studentPhone: faker.phone.number({ style: 'national' }),
        parentPhone: faker.phone.number({ style: 'national' }),
        school: `${faker.location.city()}고등학교`,
        schoolYear: faker.helpers.arrayElement(['1', '2', '3']),
        studentAnswers: [],
        appStudentId: null,
        appParentLinkId: null,
        lectureId: faker.string.uuid(),
        instructorId: faker.string.uuid(),
        registeredAt: faker.date.recent(),
        createdAt: faker.date.past(),
        updatedAt: faker.date.recent(),
        status: 'ACTIVE',
        memo: null,
        deletedAt: null,
      },
    ],
    exams: [
      {
        id: faker.string.uuid(),
        title: faker.word.words(2) + ' 시험',
        gradingStatus: 'PENDING',
        _count: { questions: 10 },
        createdAt: faker.date.past(),
        lectureId: faker.string.uuid(),
        instructorId: faker.string.uuid(),
        cutoffScore: 0,
        source: null,
        updatedAt: faker.date.recent(),
      },
    ],
    _count: { enrollments: 2 },
  },

  /** 다른 강사의 강의 (권한 테스트용) */
  otherInstructor: {
    id: faker.string.uuid(),
    instructorId: faker.string.uuid(),
    title: '타 강사 강의',
    subject: '기타',
    description: '다른 강사의 강의입니다.',
    startAt: new Date('2024-03-01'),
    endAt: new Date('2024-06-30'),
    status: LectureStatus.IN_PROGRESS,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    lectureTimes: [],
    instructor: { user: { name: 'Other Instructor' } },
    enrollments: [],
    exams: [],
    _count: { enrollments: 0 },
  },

  /** 종강된 강의 */
  completed: {
    id: faker.string.uuid(),
    instructorId: mockInstructor.id,
    title: '완료된 강의',
    subject: '수학',
    description: '이미 종료된 강의입니다.',
    startAt: faker.date.past(),
    endAt: faker.date.past(),
    status: LectureStatus.COMPLETED,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    deletedAt: null,
    lectureTimes: [],
    instructor: mockInstructorWithUser,
    enrollments: [],
    exams: [],
    _count: { enrollments: 0 },
  },
};

/** 강의 생성 요청 DTO */
export const createLectureRequests = {
  /** 기본 강의 생성 요청 */
  basic: {
    title: faker.commerce.productName() + ' 신규 강의',
    subject: '수학',
    description: faker.lorem.paragraph(),
    startAt: faker.date.soon().toISOString().split('T')[0],
    endAt: faker.date.future().toISOString().split('T')[0],
    status: LectureStatus.SCHEDULED,
    lectureTimes: [
      {
        day: 'MON',
        startTime: '14:00',
        endTime: '16:00',
      },
      {
        day: 'WED',
        startTime: '14:00',
        endTime: '16:00',
      },
    ],
  },

  /** Enrollments와 함께 생성하는 요청 */
  withEnrollments: {
    title: faker.commerce.productName() + ' 패키지 강의',
    subject: '과학',
    description: faker.lorem.paragraph(),
    startAt: faker.date.soon().toISOString().split('T')[0],
    endAt: faker.date.future().toISOString().split('T')[0],
    status: LectureStatus.SCHEDULED,
    lectureTimes: [
      {
        day: 'TUE',
        startTime: '15:00',
        endTime: '17:00',
      },
    ],
    enrollments: [
      {
        studentName: faker.person.fullName(),
        school: `${faker.person.lastName()}고등학교`,
        schoolYear: '고1',
        studentPhone: faker.phone.number({ style: 'national' }),
        parentPhone: faker.phone.number({ style: 'national' }),
      },
      {
        studentName: faker.person.fullName(),
        school: `${faker.person.lastName()}고등학교`,
        schoolYear: '고2',
        studentPhone: faker.phone.number({ style: 'national' }),
        parentPhone: faker.phone.number({ style: 'national' }),
      },
    ],
  },
};

/** 강의 수정 요청 DTO */
export const updateLectureRequests = {
  /** 전체 필드 수정 */
  full: {
    title: faker.commerce.productName() + ' 수정된 강의명',
    subject: '수정된 과목',
    description: faker.lorem.paragraph(),
    startAt: faker.date.soon().toISOString().split('T')[0],
    endAt: faker.date.future().toISOString().split('T')[0],
    status: LectureStatus.IN_PROGRESS,
  },

  /** 일부 필드만 수정 */
  partial: {
    title: faker.commerce.productName() + ' 부분 수정',
    description: undefined, // undefined는 제외되어야 함
  },

  /** 제목만 수정 */
  titleOnly: {
    title: '제목만 변경됨',
  },
};

/** 강의 목록 조회 응답 Mock */
export const mockLecturesListResponse = {
  lectures: [
    {
      ...mockLectures.basic,
      instructor: mockInstructorWithUser,
      lectureTimes: [],
      _count: { enrollments: 10 },
    },
    {
      ...mockLectures.withEnrollments,
      instructor: mockInstructorWithUser,
      lectureTimes: [],
      _count: { enrollments: 5 },
    },
  ],
  totalCount: 2,
};
