// import { z } from 'zod';

// 통계 산출 요청 (POST)은 Body가 필요 없음 (URL Param examId만 사용)
// 통계 조회 요청 (GET)도 URL Param examId만 사용

/** 문항별 통계 DTO */
export type QuestionStatisticDto = {
  questionId: string;
  /** 문항 번호 (편의상 추가)*/
  questionNumber?: number;
  /** 총 제출 수 */
  totalSubmissions: number;
  /** 정답률 (%) */
  correctRate: number;
  /** 선지별 선택 비율 (선지번호: 비율) */
  choiceRates: Record<string, number> | null;
};

/** 시험 전체 통계 응답 DTO */
export type GetExamStatisticsResponseDto = {
  examStats: {
    /** 평균 점수 */
    averageScore: number;
    /** 최고 점수 */
    highestScore: number;
    /** 최저 점수 */
    lowestScore: number;
    /** 총 응시자 수 */
    totalExaminees: number;
    /** 시험 일자 */
    examDate: Date | null;
  };
  /** 문항별 세부 통계 목록 */
  questionStats: QuestionStatisticDto[];
  /** 학생별 성적 및 석차 목록 */
  studentStats: {
    /** 수강 ID */
    enrollmentId: string;
    /** 학생 이름 */
    studentName: string;
    /** 학교명 */
    school: string | null;
    /** 맞은 문항 수 */
    correctCount: number;
    /** 점수 */
    score: number;
    /** 석차 */
    rank: number;
    /** 총 응시자 수 (석차 산출용) */
    totalRank: number;
  }[];
};

// Zod 스키마는 Validation에 주로 쓰이며 Response Typing에는 필수가 아니므로 생략하거나 필요시 추가
// 여기서는 타입 위주로 정의함.
