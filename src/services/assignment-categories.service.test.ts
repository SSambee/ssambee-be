import { AssignmentCategoryService } from './assignment-categories.service.js';
import { AssignmentCategoryRepository } from '../repos/assignment-categories.repo.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('AssignmentCategoryService', () => {
  let service: AssignmentCategoryService;
  let mockRepo: Partial<AssignmentCategoryRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockCategory = {
    id: 'category-1',
    instructorId: mockInstructorId,
    name: 'Weekly Word Test',
    resultPresets: ['Fail', 'Pass', 'Excellent'],
    createdAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findByInstructorId: jest.fn(),
      findById: jest.fn(),
      findByInstructorIdAndName: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    service = new AssignmentCategoryService(
      mockRepo as AssignmentCategoryRepository,
      mockPrisma,
    );
  });

  describe('createCategory', () => {
    const createDto = {
      name: 'Weekly Word Test',
      resultPresets: ['Fail', 'Pass', 'Excellent'],
    };

    it('성공적으로 카테고리를 생성해야 한다', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.create as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.createCategory(mockInstructorId, createDto);

      expect(mockRepo.findByInstructorIdAndName).toHaveBeenCalledWith(
        mockInstructorId,
        createDto.name,
      );
      expect(mockRepo.create).toHaveBeenCalledWith({
        instructorId: mockInstructorId,
        ...createDto,
      });
      expect(result).toEqual(mockCategory);
    });

    it('이름이 중복된 경우 ConflictException을 던져야 한다', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('DB 제약 조건 위반 시 ConflictException을 던져야 한다', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '1.0.0' },
      );
      (mockRepo.create as jest.Mock).mockRejectedValue(p2002Error);

      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getCategoriesByInstructor', () => {
    it('목록을 반환해야 한다', async () => {
      const categories = [mockCategory];
      (mockRepo.findByInstructorId as jest.Mock).mockResolvedValue(categories);

      const result = await service.getCategoriesByInstructor(mockInstructorId);

      expect(mockRepo.findByInstructorId).toHaveBeenCalledWith(
        mockInstructorId,
      );
      expect(result).toEqual(categories);
    });
  });

  describe('getCategoryById', () => {
    it('권한이 있는 경우 항목을 반환해야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.getCategoryById(
        mockCategory.id,
        mockInstructorId,
      );

      expect(mockRepo.findById).toHaveBeenCalledWith(mockCategory.id);
      expect(result).toEqual(mockCategory);
    });

    it('항목을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getCategoryById(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('권한이 없는 경우 ForbiddenException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      await expect(
        service.getCategoryById(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateCategory', () => {
    const updateDto = {
      name: 'New Name',
      resultPresets: ['C', 'B', 'A'],
    };

    it('성공적으로 수정해야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.update as jest.Mock).mockResolvedValue({
        ...mockCategory,
        ...updateDto,
      });

      const result = await service.updateCategory(
        mockCategory.id,
        mockInstructorId,
        updateDto,
      );

      expect(mockRepo.update).toHaveBeenCalledWith(mockCategory.id, updateDto);
      expect(result.name).toBe(updateDto.name);
    });

    it('항목을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('권한이 없는 경우 ForbiddenException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('수정하려는 이름이 중복된 경우 ConflictException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-category', // Different ID
        name: updateDto.name,
      });

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, {
          name: updateDto.name,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('DB 제약 조건 위반 시 ConflictException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '1.0.0' },
      );
      (mockRepo.update as jest.Mock).mockRejectedValue(p2002Error);

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteCategory', () => {
    it('성공적으로 삭제해야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.delete as jest.Mock).mockResolvedValue(mockCategory);

      await service.deleteCategory(mockCategory.id, mockInstructorId);

      expect(mockRepo.delete).toHaveBeenCalledWith(mockCategory.id);
    });

    it('항목을 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteCategory(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('권한이 없는 경우 ForbiddenException을 던져야 한다', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      await expect(
        service.deleteCategory(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
