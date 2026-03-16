/**
 * 페이지네이션 응답 결과 인터페이스
 */
export interface PaginationResult<T> {
  /** 데이터 목록 */
  list: T[];
  /** 페이지네이션 정보 */
  pagination: {
    /** 페이지당 항목 수 */
    limit: number;
    /** 다음 페이지 존재 여부 */
    hasNextPage: boolean;
    /** 이전 페이지 존재 여부 */
    hasPrevPage: boolean;

    /** 전체 항목 수 (페이지 기반 시 필수) */
    totalCount?: number;
    /** 전체 페이지 수 (페이지 기반 시 필수) */
    totalPage?: number;
    /** 현재 페이지 (페이지 기반 시 필수) */
    currentPage?: number;

    /** 다음 데이터 조회를 위한 커서 (커서 기반 시 필수) */
    nextCursor?: string;
  };
}

/**
 * Prisma 쿼리용 skip/take 값을 계산합니다.
 *
 * @param page - 현재 페이지 번호
 * @param limit - 페이지당 항목 수
 * @returns Prisma 쿼리에 사용할 skip 및 take 객체
 */
export const getPagingParams = (page: number, limit: number) => {
  const skip = (page - 1) * limit;
  const take = limit;
  return { skip, take };
};

/**
 * 페이지 기반 페이지네이션 응답 데이터를 생성합니다.
 *
 * @param data - 현재 페이지의 데이터 목록
 * @param totalCount - 전체 데이터 항목 수
 * @param page - 현재 페이지 번호
 * @param limit - 페이지당 항목 수
 * @returns 포맷팅된 페이지네이션 결과 객체
 */
export const getPagingData = <T>(
  data: T[],
  totalCount: number,
  page: number,
  limit: number,
): PaginationResult<T> => {
  const totalPage = Math.ceil(totalCount / limit);

  return {
    list: data,
    pagination: {
      totalCount,
      totalPage,
      currentPage: page,
      limit: limit,
      hasNextPage: page * limit < totalCount,
      hasPrevPage: page > 1,
    },
  };
};
