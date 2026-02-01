import { fakerKO as faker } from '@faker-js/faker';
import type { QuestionStatistic } from '../../generated/prisma/client.js';
import { mockExams, mockQuestions } from './exams.fixture.js';

/** Mock QuestionStatistic 데이터 */
export const mockQuestionStats = {
  q1: {
    id: 'stat-1',
    examId: mockExams.basic.id,
    questionId: mockQuestions.multipleChoice.id,
    totalSubmissions: 10,
    correctRate: 70.0,
    choiceRates: { '1': 70.0, '2': 10.0, '3': 10.0, '4': 10.0 },
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as QuestionStatistic,
  q2: {
    id: 'stat-2',
    examId: mockExams.basic.id,
    questionId: mockQuestions.shortAnswer.id,
    totalSubmissions: 10,
    correctRate: 50.0,
    choiceRates: null,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as QuestionStatistic,
};

/** Mock Exam Summary 데이터 */
export const mockExamSummary = {
  averageScore: faker.number.float({ min: 0, max: 100, fractionDigits: 1 }),
  highestScore: 100,
  lowestScore: 40,
  totalExaminees: 2,
  examDate: faker.date.past(),
};

/** Mock Student Grades with Info */
export const mockStudentGrades = [
  {
    enrollmentId: 'enroll-1',
    score: 90,
    enrollment: {
      id: 'enroll-1',
      studentName: faker.person.fullName(),
      school: `${faker.location.city()}고등학교`,
    },
  },
  {
    enrollmentId: 'enroll-2',
    score: 80,
    enrollment: {
      id: 'enroll-2',
      studentName: faker.person.fullName(),
      school: `${faker.location.city()}고등학교`,
    },
  },
];

/** Mock Student Correct Counts */
export const mockCorrectCounts = {
  'enroll-1': 10,
  'enroll-2': 8,
};
