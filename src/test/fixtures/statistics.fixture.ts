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
  averageScore: 75.5,
  highestScore: 100,
  lowestScore: 40,
  totalExaminees: 2,
  examDate: new Date('2024-03-01T10:00:00Z'),
};

/** Mock Student Grades with Info */
export const mockStudentGrades = [
  {
    enrollmentId: 'enroll-1',
    score: 90,
    enrollment: {
      id: 'enroll-1',
      studentName: '학생1',
      school: 'A고등학교',
    },
  },
  {
    enrollmentId: 'enroll-2',
    score: 80,
    enrollment: {
      id: 'enroll-2',
      studentName: '학생2',
      school: 'B고등학교',
    },
  },
];

/** Mock Student Correct Counts */
export const mockCorrectCounts = {
  'enroll-1': 10,
  'enroll-2': 8,
};
