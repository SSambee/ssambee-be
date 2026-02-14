import {
  StudentPostStatus,
  AnswerStatus,
} from '../constants/posts.constant.js';

/**
 * 프론트엔드용 학생 질문 상태 변환 함수
 *
 * 백엔드 상태를 프론트엔드에서 사용하는 상태값으로 매핑합니다.
 * - PENDING (백엔드) -> BEFORE (답변 대기)
 * - RESOLVED (백엔드) -> REGISTERED (답변 완료)
 * - COMPLETED (백엔드) -> COMPLETED (확인 완료)
 *
 * @param status - 백엔드 학생 질문 상태
 * @returns 프론트엔드용 답변 상태
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
      return AnswerStatus.BEFORE; // 기본값: 답변 대기
  }
};
