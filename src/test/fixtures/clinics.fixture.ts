import { fakerKO as faker } from '@faker-js/faker';
import type { Clinic } from '../../generated/prisma/client.js';
import { mockExams } from './exams.fixture.js';
import { mockEnrollments } from './enrollments.fixture.js';
import { mockLectures } from './lectures.fixture.js';

/** Mock Clinic 데이터 */
export const mockClinics = {
  pending: {
    id: 'clinic-1',
    lectureId: mockLectures.basic.id,
    examId: mockExams.basic.id,
    lectureEnrollmentId: 'le-1',
    notificationStatus: 'READY',
    title: '수학 중간고사 클리닉',
    deadline: new Date('2024-12-31'),
    status: 'PENDING',
    memo: '오답 정리 필수',
    instructorId: mockLectures.basic.instructorId,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Clinic,

  completed: {
    id: 'clinic-2',
    lectureId: mockLectures.basic.id,
    examId: mockExams.basic.id,
    lectureEnrollmentId: 'le-2',
    notificationStatus: 'READY',
    title: '수학 중간고사 클리닉',
    deadline: new Date('2024-12-31'),
    status: 'COMPLETED',
    memo: '완료됨',
    instructorId: mockLectures.basic.instructorId,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Clinic,
};

/** Clinic과 관계 데이터가 포함된 Mock (조회용) */
export const mockClinicWithRelations = {
  ...mockClinics.pending,
  lectureEnrollmentId: 'le-1',
  lectureEnrollment: {
    enrollment: {
      id: mockEnrollments.active.id,
      studentName: mockEnrollments.active.studentName,
      school: mockEnrollments.active.school,
      schoolYear: mockEnrollments.active.schoolYear,
      studentPhone: mockEnrollments.active.studentPhone,
      parentPhone: mockEnrollments.active.parentPhone,
    },
  },
  lecture: {
    id: mockLectures.basic.id,
    title: mockLectures.basic.title,
  },
  exam: {
    id: mockExams.basic.id,
    title: mockExams.basic.title,
    cutoffScore: mockExams.basic.cutoffScore,
    schedule: {
      startTime: faker.date.soon(),
    },
  },
};

/** 클리닉 생성 요청 데이터 */
export const createClinicDto = {
  title: faker.word.words(2) + ' 클리닉',
  deadline: faker.date.future().toISOString().split('T')[0],
  memo: '중요 문제 위주로 복습',
};

/** 클리닉 수정 요청 데이터 */
export const updateClinicDto = {
  clinicIds: [mockClinics.pending.id],
  updates: {
    status: 'SENT',
    deadline: faker.date.future().toISOString().split('T')[0],
    memo: '학부모님께 발송 완료',
  },
};
