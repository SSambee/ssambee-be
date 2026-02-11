import { PrismaClient } from '../generated/prisma/client.js';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../err/http.exception.js';
import { SchedulesRepository } from '../repos/schedules.repo.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { parseToUtc } from '../utils/date.util.js';

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

    // 2. 값 변환 (KST -> UTC)
    const startTime = parseToUtc(data.startTime);
    const endTime = parseToUtc(data.endTime);

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
      startTime: string;
      endTime: string;
      category?: string;
    },
  ) {
    const start = parseToUtc(query.startTime);
    const end = parseToUtc(query.endTime);

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

    // 입력값(ISO String) -> Date(UTC) - KST로 해석
    const newStart = data.startTime ? parseToUtc(data.startTime) : currentStart;
    const newEnd = data.endTime ? parseToUtc(data.endTime) : currentEnd;

    // 간단한 유효성 검사 (시작일 > 종료일 불가)
    if (newStart > newEnd) {
      throw new ConflictException(
        '종료일시는 시작일시보다 같거나 늦어야 합니다.',
      );
    }

    return this.schedulesRepo.update(id, {
      title: data.title,
      memo: data.memo,
      startTime: data.startTime ? newStart : undefined,
      endTime: data.endTime ? newEnd : undefined,
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
