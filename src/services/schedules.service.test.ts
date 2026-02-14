import { SchedulesService } from './schedules.service.js';
import { SchedulesRepository } from '../repos/schedules.repo.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('SchedulesService - @unit', () => {
  let service: SchedulesService;
  let mockSchedulesRepo: Partial<SchedulesRepository>;
  let mockCategoryRepo: Partial<ScheduleCategoryRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockSchedule = {
    id: 'schedule-1',
    instructorId: mockInstructorId,
    authorName: '홍길동',
    authorRole: 'INSTRUCTOR',
    title: '회의',
    memo: '주간회의',
    startTime: new Date('2024-02-01T09:00:00Z'),
    endTime: new Date('2024-02-01T10:00:00Z'),
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockSchedulesRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockCategoryRepo = {
      findById: jest.fn(),
    };
    service = new SchedulesService(
      mockSchedulesRepo as SchedulesRepository,
      mockCategoryRepo as ScheduleCategoryRepository,
      mockPrisma,
    );
  });

  describe('[일정 생성] createSchedule', () => {
    const createDto = {
      title: '새 일정',
      startTime: '2024-02-01T09:00:00Z',
      endTime: '2024-02-01T10:00:00Z',
    };

    it('성공적으로 일정을 생성해야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.create as jest.Mock).mockResolvedValue(mockSchedule);

      // 실행 (Act)
      const result = await service.createSchedule(
        mockInstructorId,
        '홍길동',
        'INSTRUCTOR',
        createDto,
      );

      // 검증 (Assert)
      expect(mockSchedulesRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockSchedule);
    });

    it('종료 시간이 시작 시간보다 빠르면 ConflictException을 던져야 한다', async () => {
      // 준비 (Arrange)
      const invalidDto = {
        ...createDto,
        startTime: '2024-02-01T10:00:00Z',
        endTime: '2024-02-01T09:00:00Z',
      };

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.createSchedule(
          mockInstructorId,
          '홍길동',
          'INSTRUCTOR',
          invalidDto,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('카테고리가 존재하지 않으면 NotFoundException을 던져야 한다', async () => {
      // 준비 (Arrange)
      const dtoWithCategory = { ...createDto, categoryId: 'cat-1' };
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue(null);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.createSchedule(
          mockInstructorId,
          '홍길동',
          'INSTRUCTOR',
          dtoWithCategory,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[일정 조회] getSchedules', () => {
    it('일정 목록을 반환해야 한다', async () => {
      // 준비 (Arrange)
      const schedules = [mockSchedule];
      (mockSchedulesRepo.findMany as jest.Mock).mockResolvedValue(schedules);

      // 실행 (Act)
      const result = await service.getSchedules(mockInstructorId, {
        startTime: '2024-02-01T00:00:00Z',
        endTime: '2024-02-01T23:59:59Z',
      });

      // 검증 (Assert)
      expect(mockSchedulesRepo.findMany).toHaveBeenCalled();
      expect(result).toEqual(schedules);
    });
  });

  describe('[일정 상세 조회] getScheduleById', () => {
    it('특정 일정을 반환해야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);

      // 실행 (Act)
      const result = await service.getScheduleById(
        mockInstructorId,
        mockSchedule.id,
      );

      // 검증 (Assert)
      expect(result).toEqual(mockSchedule);
    });

    it('일정을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(null);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.getScheduleById(mockInstructorId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('타 강사의 일정에 접근하려 하면 ForbiddenException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue({
        ...mockSchedule,
        instructorId: 'other-instructor',
      });

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.getScheduleById(mockInstructorId, mockSchedule.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('[일정 수정] updateSchedule', () => {
    const updateDto = { title: '수정된 일정' };

    it('성공적으로 일정을 수정해야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);
      (mockSchedulesRepo.update as jest.Mock).mockResolvedValue({
        ...mockSchedule,
        ...updateDto,
      });

      // 실행 (Act)
      const result = await service.updateSchedule(
        mockSchedule.id,
        mockInstructorId,
        updateDto,
      );

      // 검증 (Assert)
      expect(mockSchedulesRepo.update).toHaveBeenCalled();
      expect(result.title).toBe(updateDto.title);
    });

    it('수정할 일정을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(null);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.updateSchedule(mockSchedule.id, mockInstructorId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('[일정 삭제] deleteSchedule', () => {
    it('성공적으로 일정을 삭제해야 한다', async () => {
      // 준비 (Arrange)
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);
      (mockSchedulesRepo.delete as jest.Mock).mockResolvedValue(mockSchedule);

      // 실행 (Act)
      await service.deleteSchedule(mockSchedule.id, mockInstructorId);

      // 검증 (Assert)
      expect(mockSchedulesRepo.delete).toHaveBeenCalledWith(mockSchedule.id);
    });
  });
});
