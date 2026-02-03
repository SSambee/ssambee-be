import { fakerKO as faker } from '@faker-js/faker';
import { QuestionType } from '../../constants/exams.constant.js';
import type { Exam, Question, Lecture } from '../../generated/prisma/client.js';
import type {
  CreateExamDto,
  UpdateExamDto,
} from '../../validations/exams.validation.js';
import { mockLectures } from './lectures.fixture.js';

/** Mock Exam 데이터 */
export const mockExams = {
  basic: {
    id: 'exam-1',
    lectureId: mockLectures.basic.id,
    instructorId: mockLectures.basic.instructorId,
    title: faker.helpers.arrayElement(['중간고사', '기말고사', '단원평가']),
    cutoffScore: 60,
    source: null,
    gradingStatus: 'PENDING',
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Exam,

  withQuestions: {
    id: 'exam-2',
    lectureId: mockLectures.withEnrollments.id,
    instructorId: mockLectures.withEnrollments.instructorId,
    title: faker.helpers.arrayElement(['중간고사', '기말고사', '단원평가']),
    cutoffScore: 70,
    source: null,
    gradingStatus: 'PENDING',
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Exam,

  otherInstructor: {
    id: 'exam-3',
    lectureId: mockLectures.otherInstructor.id,
    instructorId: mockLectures.otherInstructor.instructorId,
    title: '타 강사 시험',
    cutoffScore: 60,
    source: null,
    gradingStatus: 'PENDING',
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Exam,
} as const;

/** Mock Question 데이터 */
export const mockQuestions = {
  multipleChoice: {
    id: 'q1',
    examId: mockExams.basic.id,
    lectureId: mockExams.basic.lectureId,
    questionNumber: 1,
    content: faker.lorem.sentence() + '?',
    score: 10,
    type: QuestionType.MULTIPLE,
    correctAnswer: 'A',
    choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
    source: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Question,

  shortAnswer: {
    id: 'q2',
    examId: mockExams.basic.id,
    lectureId: mockExams.basic.lectureId,
    questionNumber: 2,
    content: faker.lorem.sentence(),
    score: 15,
    type: QuestionType.ESSAY,
    correctAnswer: '정답입니다.',
    choices: null,
    source: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Question,

  essay: {
    id: 'q3',
    examId: mockExams.withQuestions.id,
    lectureId: mockExams.withQuestions.lectureId,
    questionNumber: 3,
    content: faker.lorem.paragraph(),
    score: 20,
    type: QuestionType.ESSAY,
    correctAnswer: '모범답안',
    choices: null,
    source: null,
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  } as Question,
} as const;

/** Exam with Questions 조합 */
export const mockExamWithQuestions = {
  basic: {
    ...mockExams.basic,
    questions: [mockQuestions.multipleChoice, mockQuestions.shortAnswer],
  },
  withMultiple: {
    ...mockExams.withQuestions,
    questions: [
      mockQuestions.multipleChoice,
      mockQuestions.shortAnswer,
      mockQuestions.essay,
    ],
  },
};

/** 시험 생성 요청 DTO */
export const createExamRequests = {
  basic: {
    title: faker.word.words(2) + ' 시험',
    cutoffScore: 60,
    questions: [
      {
        questionNumber: 1,
        content: faker.lorem.sentence(),
        correctAnswer: 'A',
        score: 10,
        type: QuestionType.MULTIPLE,
        choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      },
    ],
  } as CreateExamDto,

  multipleQuestions: {
    title: faker.word.words(2) + ' 시험',
    cutoffScore: 70,
    questions: [
      {
        questionNumber: 1,
        content: faker.lorem.sentence(),
        correctAnswer: 'A',
        score: 10,
        type: QuestionType.MULTIPLE,
        choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      },
      {
        questionNumber: 2,
        content: faker.lorem.sentence(),
        correctAnswer: '정답입니다',
        score: 15,
        type: QuestionType.MULTIPLE,
        choices: {
          '1': '선택지1',
          '2': '선택지2',
          '3': '선택지3',
          '4': '선택지4',
        },
      },
    ],
  } as CreateExamDto,

  noQuestions: {
    title: faker.word.words(2) + ' 시험',
    cutoffScore: 50,
    questions: [],
  } as CreateExamDto,
} as const;

/** 시험 수정 요청 DTO */
export const updateExamRequests = {
  basic: {
    title: faker.word.words(2) + ' (수정)',
    cutoffScore: 65,
  } as UpdateExamDto,

  withQuestions: {
    title: '문제 수정 포함',
    cutoffScore: 70,
    questions: [
      {
        id: 'q1',
        questionNumber: 1,
        content: '수정된 문제 내용',
        correctAnswer: 'B',
        score: 12,
        type: QuestionType.MULTIPLE,
        choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      },
      {
        questionNumber: 2,
        content: '새로운 문제',
        correctAnswer: '새 정답',
        score: 15,
        type: QuestionType.MULTIPLE,
        choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      },
    ],
  } as UpdateExamDto,

  deleteQuestions: {
    title: '문제 삭제 포함',
    cutoffScore: 60,
    questions: [
      {
        id: 'q1',
        questionNumber: 1,
        content: '유지되는 문제',
        correctAnswer: 'A',
        score: 10,
        type: QuestionType.MULTIPLE,
        choices: { '1': 'A', '2': 'B', '3': 'C', '4': 'D' },
      },
    ],
  } as UpdateExamDto,
} as const;

/** Mock 강의 데이터 (테스트용) */
export const mockLectureForExam = {
  basic: mockLectures.basic as Lecture,
  otherInstructor: mockLectures.otherInstructor as Lecture,
} as const;

/** 유틸리티 함수: Mock Exam 생성 */
export const createMockExam = (overrides?: Partial<Exam>): Exam => ({
  ...mockExams.basic,
  ...overrides,
});

/** 유틸리티 함수: Mock Question 생성 */
export const createMockQuestion = (
  overrides?: Partial<Question>,
): Question => ({
  ...mockQuestions.multipleChoice,
  ...overrides,
});

/** 유틸리티 함수: CreateExamDto 생성 */
export const createMockCreateExamDto = (
  overrides?: Partial<CreateExamDto>,
): CreateExamDto => ({
  ...createExamRequests.basic,
  ...overrides,
});

/** 유틸리티 함수: UpdateExamDto 생성 */
export const createMockUpdateExamDto = (
  overrides?: Partial<UpdateExamDto>,
): UpdateExamDto => ({
  ...updateExamRequests.basic,
  ...overrides,
});
