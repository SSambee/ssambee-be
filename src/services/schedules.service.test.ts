import { SchedulesService } from './schedules.service.js';
import { SchedulesRepository } from '../repos/schedules.repo.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('SchedulesService', () => {
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

  describe('createSchedule', () => {
    const createDto = {
      title: '새 일정',
      startTime: '2024-02-01T09:00:00Z',
      endTime: '2024-02-01T10:00:00Z',
    };

    it('should create a schedule successfully', async () => {
      (mockSchedulesRepo.create as jest.Mock).mockResolvedValue(mockSchedule);

      const result = await service.createSchedule(
        mockInstructorId,
        '홍길동',
        'INSTRUCTOR',
        createDto,
      );

      expect(mockSchedulesRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockSchedule);
    });

    it('should throw ConflictException if endTime is before startTime', async () => {
      const invalidDto = {
        ...createDto,
        startTime: '2024-02-01T10:00:00Z',
        endTime: '2024-02-01T09:00:00Z',
      };

      await expect(
        service.createSchedule(
          mockInstructorId,
          '홍길동',
          'INSTRUCTOR',
          invalidDto,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      const dtoWithCategory = { ...createDto, categoryId: 'cat-1' };
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue(null);

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

  describe('getSchedules', () => {
    it('should return schedules', async () => {
      const schedules = [mockSchedule];
      (mockSchedulesRepo.findMany as jest.Mock).mockResolvedValue(schedules);

      const result = await service.getSchedules(mockInstructorId, {});

      expect(mockSchedulesRepo.findMany).toHaveBeenCalled();
      expect(result).toEqual(schedules);
    });
  });

  describe('getScheduleById', () => {
    it('should return a schedule', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);

      const result = await service.getScheduleById(
        mockInstructorId,
        mockSchedule.id,
      );

      expect(result).toEqual(mockSchedule);
    });

    it('should throw NotFoundException if schedule not found', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getScheduleById(mockInstructorId, 'invalid-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor does not match', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue({
        ...mockSchedule,
        instructorId: 'other-instructor',
      });

      await expect(
        service.getScheduleById(mockInstructorId, mockSchedule.id),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateSchedule', () => {
    const updateDto = { title: '수정된 일정' };

    it('should update a schedule successfully', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);
      (mockSchedulesRepo.update as jest.Mock).mockResolvedValue({
        ...mockSchedule,
        ...updateDto,
      });

      const result = await service.updateSchedule(
        mockSchedule.id,
        mockInstructorId,
        updateDto,
      );

      expect(mockSchedulesRepo.update).toHaveBeenCalled();
      expect(result.title).toBe(updateDto.title);
    });

    it('should throw NotFoundException if schedule not found', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateSchedule(mockSchedule.id, mockInstructorId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSchedule', () => {
    it('should delete a schedule successfully', async () => {
      (mockSchedulesRepo.findById as jest.Mock).mockResolvedValue(mockSchedule);
      (mockSchedulesRepo.delete as jest.Mock).mockResolvedValue(mockSchedule);

      await service.deleteSchedule(mockSchedule.id, mockInstructorId);

      expect(mockSchedulesRepo.delete).toHaveBeenCalledWith(mockSchedule.id);
    });
  });
});
