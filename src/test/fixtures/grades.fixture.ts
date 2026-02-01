import { fakerKO as faker } from '@faker-js/faker';
import type { Grade, StudentAnswer } from '../../generated/prisma/client.js';
import type { SubmitGradingDto } from '../../validations/grades.validation.js';
import { mockExams, mockQuestions } from './exams.fixture.js';
import { mockEnrollments } from './enrollments.fixture.js';

/** Mock StudentAnswer 데이터 */
export const mockStudentAnswers = {
  exam1_student1: [
    {
      id: 'sa-1',
      lectureId: mockExams.basic.lectureId,
      enrollmentId: mockEnrollments.active.id,
      questionId: mockQuestions.multipleChoice.id,
      submittedAnswer: 'A',
      isCorrect: true,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    },
    {
      id: 'sa-2',
      lectureId: mockExams.basic.lectureId,
      enrollmentId: mockEnrollments.active.id,
      questionId: mockQuestions.shortAnswer.id,
      submittedAnswer: '정답입니다.',
      isCorrect: true,
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    },
  ] as StudentAnswer[],
};

/** Mock Grade 데이터 */
export const mockGrades = {
  exam1_student1: {
    id: 'grade-1',
    lectureId: mockExams.basic.lectureId,
    examId: mockExams.basic.id,
    enrollmentId: mockEnrollments.active.id,
    score: 25,
    isPass: true,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Grade,

  basic: {
    id: faker.string.uuid(),
    lectureId: mockExams.basic.lectureId,
    examId: mockExams.basic.id,
    enrollmentId: mockEnrollments.active.id,
    score: 25,
    isPass: true,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Grade,

  withEnrollment: {
    id: faker.string.uuid(),
    lectureId: mockExams.basic.lectureId,
    examId: mockExams.basic.id,
    enrollmentId: mockEnrollments.active.id,
    score: 100,
    isPass: true,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    enrollment: mockEnrollments.active,
  } as Grade & { enrollment: typeof mockEnrollments.active },
};

/** 채점 제출 요청 DTO */
export const submitGradingRequests = {
  basic: {
    enrollmentId: mockEnrollments.active.id,
    totalScore: 25,
    correctCount: 2,
    answers: [
      {
        questionId: mockQuestions.multipleChoice.id,
        submittedAnswer: 'A',
        isCorrect: true,
      },
      {
        questionId: mockQuestions.shortAnswer.id,
        submittedAnswer: '정답입니다.',
        isCorrect: true,
      },
    ],
  } as SubmitGradingDto,

  withEssay: {
    enrollmentId: mockEnrollments.active.id,
    totalScore: 20,
    correctCount: 1,
    answers: [
      {
        questionId: mockQuestions.essay.id,
        submittedAnswer: '서술형 답안입니다.',
        isCorrect: true,
      },
    ],
  } as SubmitGradingDto,
};
