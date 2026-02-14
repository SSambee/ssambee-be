import {
  StudentPostStatus,
  AnswerStatus,
} from '../constants/posts.constant.js';

/**
 * 학생 질문 통계 Raw 데이터 타입
 * studentPostsRepository.getStats()의 반환 타입
 */
export interface StudentPostStatsRaw {
  totalCount: number;
  thisMonthCount: number;
  lastMonthCount: number;
  unansweredCount: number;
  processingCount: number;
  unansweredCriteria: number;
  answeredThisMonthCount: number;
}

/**
 * 포맷팅된 학생 질문 통계 타입
 */
export interface StudentPostStatsFormatted {
  totalCount: number;
  increaseRate: string;
  unansweredCount: number;
  unansweredCriteria: number;
  answeredThisMonthCount: number;
  processingCount: number;
}

/**
 * 학생 질문 통계 포맷팅 헬퍼 함수
 * increaseRate를 계산하고 프론트엔드용 stats 객체를 반환
 *
 * @param statsRaw - studentPostsRepository.getStats()의 원시 데이터
 * @returns 포맷팅된 통계 객체
 */
export const formatStudentPostStats = (
  statsRaw: StudentPostStatsRaw,
): StudentPostStatsFormatted => {
  // 증가율 계산: (이번달 - 지난달) / 지난달 * 100
  let increaseRate = 0;
  if (statsRaw.lastMonthCount > 0) {
    increaseRate =
      ((statsRaw.thisMonthCount - statsRaw.lastMonthCount) /
        statsRaw.lastMonthCount) *
      100;
  }

  return {
    totalCount: statsRaw.totalCount,
    increaseRate: `${parseFloat(increaseRate.toFixed(1))}%`,
    unansweredCount: statsRaw.unansweredCount,
    unansweredCriteria: statsRaw.unansweredCriteria,
    answeredThisMonthCount: statsRaw.answeredThisMonthCount,
    processingCount: statsRaw.processingCount,
  };
};

/**
 * 프론트엔드용 학생 질문 상태 변환
 * Backend: PENDING -> Frontend: BEFORE (답변 대기)
 * Backend: RESOLVED -> Frontend: REGISTERED (답변 완료)
 * Backend: COMPLETED -> Frontend: COMPLETED (확인 완료)
 */
export const toFrontendStudentPostStatus = (
  status: StudentPostStatus,
): AnswerStatus => {
  switch (status) {
    case StudentPostStatus.PENDING:
      return AnswerStatus.BEFORE;
    case StudentPostStatus.RESOLVED:
      return AnswerStatus.REGISTERED;
    case StudentPostStatus.COMPLETED:
      return AnswerStatus.COMPLETED;
    default:
      return AnswerStatus.BEFORE; // Default fallback
  }
};
