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
    title: '중간고사',
    cutoffScore: 60,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as Exam,

  withQuestions: {
    id: 'exam-2',
    lectureId: mockLectures.withEnrollments.id,
    instructorId: mockLectures.withEnrollments.instructorId,
    title: '기말고사',
    cutoffScore: 70,
    createdAt: new Date('2024-03-15'),
    updatedAt: new Date('2024-03-15'),
  } as Exam,

  otherInstructor: {
    id: 'exam-3',
    lectureId: mockLectures.otherInstructor.id,
    instructorId: mockLectures.otherInstructor.instructorId,
    title: '타 강사 시험',
    cutoffScore: 60,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as Exam,
} as const;

/** Mock Question 데이터 */
export const mockQuestions = {
  multipleChoice: {
    id: 'q1',
    examId: mockExams.basic.id,
    questionNumber: 1,
    content: '다음 중 옳은 것은?',
    score: 10,
    type: QuestionType.MULTIPLE,
    correctAnswer: 'A',
    options: ['A', 'B', 'C', 'D'],
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as Question,

  shortAnswer: {
    id: 'q2',
    examId: mockExams.basic.id,
    questionNumber: 2,
    content: '간단히 설명하시오.',
    score: 15,
    type: QuestionType.SHORT,
    correctAnswer: '정답입니다.',
    options: null,
    createdAt: new Date('2024-03-01'),
    updatedAt: new Date('2024-03-01'),
  } as Question,

  essay: {
    id: 'q3',
    examId: mockExams.withQuestions.id,
    questionNumber: 3,
    content: '자세히 서술하시오.',
    score: 20,
    type: QuestionType.ESSAY,
    correctAnswer: null,
    options: null,
    createdAt: new Date('2024-03-15'),
    updatedAt: new Date('2024-03-15'),
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
    title: '신규 시험',
    cutoffScore: 60,
    questions: [
      {
        questionNumber: 1,
        content: '첫 번째 문제',
        correctAnswer: 'A',
        score: 10,
        type: QuestionType.MULTIPLE,
        options: ['A', 'B', 'C', 'D'],
      },
    ],
  } as CreateExamDto,

  multipleQuestions: {
    title: '다중 문제 시험',
    cutoffScore: 70,
    questions: [
      {
        questionNumber: 1,
        content: '다중 선택 문제',
        correctAnswer: 'A',
        score: 10,
        type: QuestionType.MULTIPLE,
        options: ['A', 'B', 'C', 'D'],
      },
      {
        questionNumber: 2,
        content: '주관식 문제',
        correctAnswer: '정답입니다',
        score: 15,
        type: QuestionType.SHORT,
      },
    ],
  } as CreateExamDto,

  noQuestions: {
    title: '문제 없는 시험',
    cutoffScore: 50,
    questions: [],
  } as CreateExamDto,
} as const;

/** 시험 수정 요청 DTO */
export const updateExamRequests = {
  basic: {
    title: '수정된 시험 제목',
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
        options: ['A', 'B', 'C', 'D'],
      },
      {
        questionNumber: 2,
        content: '새로운 문제',
        correctAnswer: '새 정답',
        score: 15,
        type: QuestionType.SHORT,
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
        options: ['A', 'B', 'C', 'D'],
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
