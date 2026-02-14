import {
  StudentPostStatus,
  AnswerStatus,
} from '../constants/posts.constant.js';

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
