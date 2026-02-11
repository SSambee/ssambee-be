import { ScheduleCategoryService } from './schedule-categories.service.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('ScheduleCategoryService', () => {
  let service: ScheduleCategoryService;
  let mockRepo: Partial<ScheduleCategoryRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockCategory = {
    id: 'category-1',
    instructorId: mockInstructorId,
    name: 'Math',
    color: '#FF0000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findByInstructorId: jest.fn(),
      findById: jest.fn(),
      findByInstructorIdAndName: jest.fn(),
      findByInstructorIdAndColor: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    service = new ScheduleCategoryService(
      mockRepo as ScheduleCategoryRepository,
      mockPrisma,
    );
  });

  describe('createCategory', () => {
    const createDto = { name: 'Math', color: '#FF0000' };

    it('should create a category successfully', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );
      (mockRepo.create as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.createCategory(mockInstructorId, createDto);

      expect(mockRepo.findByInstructorIdAndName).toHaveBeenCalledWith(
        mockInstructorId,
        createDto.name,
      );
      expect(mockRepo.findByInstructorIdAndColor).toHaveBeenCalledWith(
        mockInstructorId,
        createDto.color,
      );
      expect(mockRepo.create).toHaveBeenCalledWith({
        instructorId: mockInstructorId,
        ...createDto,
      });
      expect(result).toEqual(mockCategory);
    });

    it('should throw ConflictException if name exists', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if color exists', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if P2002 error occurs', async () => {
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );

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
    it('should return categories', async () => {
      const categories = [mockCategory];
      (mockRepo.findByInstructorId as jest.Mock).mockResolvedValue(categories);

      const result = await service.getCategoriesByInstructor(mockInstructorId);

      expect(mockRepo.findByInstructorId).toHaveBeenCalledWith(
        mockInstructorId,
      );
      expect(result).toEqual(categories);
    });
  });

  describe('updateCategory', () => {
    const updateDto = { name: 'Science', color: '#00FF00' };

    it('should update a category successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );
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

    it('should throw NotFoundException if category not found', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor does not match', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if new name exists', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'other-category',
        name: updateDto.name,
      });

      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, {
          name: updateDto.name,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if P2002 error occurs', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );

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
    it('should delete a category successfully', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.delete as jest.Mock).mockResolvedValue(mockCategory);

      await service.deleteCategory(mockCategory.id, mockInstructorId);

      expect(mockRepo.delete).toHaveBeenCalledWith(mockCategory.id);
    });

    it('should throw NotFoundException if category not found', async () => {
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteCategory(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor does not match', async () => {
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
