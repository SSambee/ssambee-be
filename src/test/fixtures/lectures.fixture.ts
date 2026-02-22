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

/** withEnrollments에 사용될 ID */
const withEnrollementsLectureId = faker.string.uuid();
const withEnrollmentsInstructorId = mockInstructor.id;

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
    id: faker.string.alphanumeric({ length: 24, casing: 'lower' }), // cuid2 형식 (24자 소문자 영숫자)
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
    lectureEnrollments: [],
    exams: [],
    _count: { lectureEnrollments: 0 },
    schoolYear: '고1',
  },

  /** Enrollments와 함께 생성될 강의 */
  withEnrollments: {
    id: withEnrollementsLectureId,
    instructorId: withEnrollmentsInstructorId,
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
    lectureEnrollments: [
      {
        id: 'le-1',
        memo: null,
        lectureId: 'lecture-id',
        enrollmentId: 'enrollment-1',
        registeredAt: new Date(),
        enrollment: {
          id: 'enrollment-1',
          studentName: 'Student 1',
          studentPhone: '010-1234-5678',
          parentPhone: '010-8765-4321',
          school: 'High School',
          schoolYear: '1',
          instructorId: 'instructor-id',
          registeredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'ACTIVE',
          memo: null,
          deletedAt: null,
          appStudentId: null,
          appParentLinkId: null,
          studentEmail: null,
        },
        studentAnswers: [],
      },
      {
        id: 'le-2',
        memo: null,
        lectureId: 'lecture-id',
        enrollmentId: 'enrollment-2',
        registeredAt: new Date(),
        enrollment: {
          id: 'enrollment-2',
          studentName: 'Student 2',
          studentPhone: '010-1111-2222',
          parentPhone: '010-3333-4444',
          school: 'High School',
          schoolYear: '2',
          instructorId: 'instructor-id',
          registeredAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'ACTIVE',
          memo: null,
          deletedAt: null,
          appStudentId: null,
          appParentLinkId: null,
          studentEmail: null,
        },
        studentAnswers: [],
      },
    ],
    exams: [
      {
        id: 'exam-1',
        title: 'Midterm Exam',
        lectureId: 'lecture-id',
        instructorId: 'instructor-id',
        cutoffScore: 0,
        source: null,
        subject: null,
        description: null,
        averageScore: null,
        gradesCount: 0,
        updatedAt: new Date(),
        createdAt: new Date(),
        gradingStatus: 'PENDING',
        examDate: new Date(),
        category: null,
        isAutoClinic: true,
        _count: { questions: 0 },
      },
    ],
    _count: { lectureEnrollments: 2 },
    schoolYear: '고1',
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
    lectureEnrollments: [],
    exams: [],

    _count: { lectureEnrollments: 0 },
    schoolYear: null,
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
    lectureEnrollments: [],
    exams: [],

    _count: { lectureEnrollments: 0 },
    schoolYear: '고3',
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
      _count: { lectureEnrollments: 10 },
    },
    {
      ...mockLectures.withEnrollments,
      instructor: mockInstructorWithUser,
      lectureTimes: [],
      _count: { lectureEnrollments: 5 },
    },
  ],
  totalCount: 2,
};
