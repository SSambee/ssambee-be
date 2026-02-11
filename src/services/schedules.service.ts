import { PrismaClient } from '../generated/prisma/client.js';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../err/http.exception.js';
import { SchedulesRepository } from '../repos/schedules.repo.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { startOfMonth, endOfMonth, addHours } from 'date-fns';

export class SchedulesService {
  constructor(
    private readonly schedulesRepo: SchedulesRepository,
    private readonly scheduleCategoryRepo: ScheduleCategoryRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * 일정 생성
   */
  async createSchedule(
    instructorId: string,
    authorName: string,
    authorRole: string,
    data: {
      title: string;
      memo?: string;
      startTime: string; // ISO String
      endTime: string; // ISO String
      categoryId?: string;
    },
  ) {
    // 1. 카테고리 검증
    if (data.categoryId) {
      const category = await this.scheduleCategoryRepo.findById(
        data.categoryId,
      );
      if (!category) {
        throw new NotFoundException('존재하지 않는 카테고리입니다.');
      }
      if (category.instructorId !== instructorId) {
        throw new ForbiddenException('해당 카테고리를 사용할 권한이 없습니다.');
      }
    }

    // 2. 값 변환
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    if (startTime > endTime) {
      throw new ConflictException(
        '종료일시는 시작일시보다 같거나 늦어야 합니다.',
      );
    }

    // 3. 생성
    return this.schedulesRepo.create({
      instructorId,
      authorName,
      authorRole,
      title: data.title,
      memo: data.memo,
      startTime,
      endTime,
      categoryId: data.categoryId,
    });
  }

  /**
   * 일정 목록 조회
   */
  async getSchedules(
    instructorId: string,
    query: {
      startDate?: string;
      endDate?: string;
      category?: string;
    },
  ) {
    let start: Date;
    let end: Date;

    // 한국 시간(KST) Offset: +9h
    const KST_OFFSET = 9;

    /**
     * KST 기준 날짜 문자열(YYYY-MM-DD)을 받아, 해당 날짜의 0시 or 23:59:59.999 (UTC)로 변환
     * 예: "2024-02-01" (KST) -> 2024-01-31T15:00:00Z (UTC)
     */
    const parseKstDate = (dateStr: string, isEnd = false) => {
      // 1. UTC 기준 Date 생성 (로컬 타임존의 간섭을 피하기 위해 ISO 포맷 사용)
      // "2024-02-01T00:00:00Z" -> UTC 0시
      const utcBase = new Date(
        `${dateStr}T${isEnd ? '23:59:59.999' : '00:00:00'}Z`,
      );

      // 2. KST(+9) -> UTC 변환이므로 9시간을 빼줌
      return addHours(utcBase, -KST_OFFSET);
    };

    /**
     * 특정 날짜(UTC Date)가 속한 "KST 기준 월"의 시작/끝 구하기
     */
    const getKstMonthRange = (baseDate: Date) => {
      // 1. UTC Date -> KST 가상 Date (시간만 +9 이동)
      const kstVirtual = addHours(baseDate, KST_OFFSET);

      // 2. 가상 Date 기준으로 월의 시작/끝 계산
      const kstStartOfMonth = startOfMonth(kstVirtual);
      const kstEndOfMonth = endOfMonth(kstVirtual);

      // 3. 다시 UTC로 복원 (-9)
      return {
        start: addHours(kstStartOfMonth, -KST_OFFSET),
        end: addHours(kstEndOfMonth, -KST_OFFSET),
      };
    };

    if (query.startDate && query.endDate) {
      // 명시된 기간 (KST 기준)
      start = parseKstDate(query.startDate);
      end = parseKstDate(query.endDate, true);
    } else if (query.startDate) {
      // 시작일이 속한 월 전체 (KST 기준)
      // "2024-02-01" -> 2024, 2, 1
      const [yearStr, monthStr] = query.startDate.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      // 1. 해당 월 1일 00:00:00 (KST) -> UTC
      // KST는 UTC+9 이므로, UTC로는 "1일 00시 - 9시간" = "전달 말일 15시"
      // Date.UTC(year, monthIndex, day, hour, minute, second)
      // monthIndex는 0-based
      const kstStartOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      start = addHours(kstStartOfMonth, -KST_OFFSET);

      // 2. 해당 월 말일 23:59:59.999 (KST) -> UTC
      // endOfMonth는 "주어진 날짜가 속한 달의 마지막 순간"을 반환
      // 여기서 주의: endOfMonth(UTC Date)는 UTC 기준으로 계산됨.
      // 따라서 "KST 기준 1일"인 `start`를 넣으면, 만약 `start`가 전 달로 넘어갔다면(1일 00시 -9시간 = 전 달), 전 달의 마지막 날을 계산해버림.
      // 그러므로 KST 기준 날짜(가상)를 만들어서 endOfMonth를 구하고, 다시 -9시간 해야 함.

      const kstVirtualDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0)); // 이것은 UTC 값이지만 KST 시각이라 가정하고 다룸
      const kstEndOfMonth = endOfMonth(kstVirtualDate); // KST 기준 말일 23:59:59.999
      end = addHours(kstEndOfMonth, -KST_OFFSET);
    } else {
      // 기본: 이번 달 (KST 기준)
      const now = new Date(); // Server UTC Now
      const range = getKstMonthRange(now);
      start = range.start;
      end = range.end;
    }

    // 카테고리 필터
    let categoryId: string | null | undefined = undefined;
    if (query.category === 'other') {
      categoryId = null;
    } else if (query.category) {
      categoryId = query.category;
    }

    const schedules = await this.schedulesRepo.findMany(instructorId, {
      startDate: start,
      endDate: end,
      categoryId,
    });

    return schedules;
  }

  /**
   * 일정 상세 조회
   */
  async getScheduleById(instructorId: string, id: string) {
    const schedule = await this.schedulesRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException('일정을 찾을 수 없습니다.');
    }
    if (schedule.instructorId !== instructorId) {
      throw new ForbiddenException('해당 일정에 접근 권한이 없습니다.');
    }
    return schedule;
  }

  /**
   * 일정 수정 (PATCH)
   */
  async updateSchedule(
    id: string,
    instructorId: string,
    data: {
      title?: string;
      memo?: string;
      startTime?: string;
      endTime?: string;
      categoryId?: string | null;
    },
  ) {
    // 1. 존재/권한 확인
    const schedule = await this.schedulesRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException('일정을 찾을 수 없습니다.');
    }
    if (schedule.instructorId !== instructorId) {
      throw new ForbiddenException('해당 일정을 수정할 권한이 없습니다.');
    }

    // 2. 카테고리 변경 시 권한 확인
    if (data.categoryId && data.categoryId !== schedule.categoryId) {
      const category = await this.scheduleCategoryRepo.findById(
        data.categoryId,
      );
      if (!category) {
        throw new NotFoundException('존재하지 않는 카테고리입니다.');
      }
      if (category.instructorId !== instructorId) {
        throw new ForbiddenException('해당 카테고리를 사용할 권한이 없습니다.');
      }
    }

    // 3. 날짜 변환 및 검증
    const currentStart = schedule.startTime;
    const currentEnd = schedule.endTime;

    // DB 저장된 시간(UTC)

    // 입력값(ISO String) -> Date(UTC)
    const newStart = data.startTime ? new Date(data.startTime) : currentStart;
    const newEnd = data.endTime ? new Date(data.endTime) : currentEnd;

    // 간단한 유효성 검사 (시작일 > 종료일 불가)
    if (newStart > newEnd) {
      throw new ConflictException(
        '종료일시는 시작일시보다 같거나 늦어야 합니다.',
      );
    }

    return this.schedulesRepo.update(id, {
      title: data.title,
      memo: data.memo,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
      categoryId: data.categoryId,
    });
  }

  /**
   * 일정 삭제
   */
  async deleteSchedule(id: string, instructorId: string) {
    const schedule = await this.schedulesRepo.findById(id);
    if (!schedule) {
      throw new NotFoundException('일정을 찾을 수 없습니다.');
    }
    if (schedule.instructorId !== instructorId) {
      throw new ForbiddenException('해당 일정을 삭제할 권한이 없습니다.');
    }

    return this.schedulesRepo.delete(id);
  }
}
