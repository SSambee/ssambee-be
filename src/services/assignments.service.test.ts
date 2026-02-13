import { AssignmentsService } from './assignments.service.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { AssignmentCategoryRepository } from '../repos/assignment-categories.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let mockAssignmentsRepo: Partial<AssignmentsRepository>;
  let mockCategoryRepo: Partial<AssignmentCategoryRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockLectureId = 'lecture-1';
  const mockCategoryId = 'category-1';
  const mockAssignment = {
    id: 'assignment-1',
    instructorId: mockInstructorId,
    lectureId: mockLectureId,
    categoryId: mockCategoryId,
    title: 'Test Assignment',
    createdAt: new Date(),
  };
  const mockCategory = {
    id: mockCategoryId,
    instructorId: mockInstructorId,
    name: 'Test Category',
    resultPresets: ['A', 'B'],
  };

  beforeEach(() => {
    mockAssignmentsRepo = {
      create: jest.fn(),
      findByInstructorId: jest.fn(),
      findByIdWithResults: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockCategoryRepo = {
      findById: jest.fn(),
    };
    service = new AssignmentsService(
      mockAssignmentsRepo as AssignmentsRepository,
      mockCategoryRepo as AssignmentCategoryRepository,
      mockPrisma,
    );
  });

  describe('createAssignment', () => {
    const createDto = {
      title: 'New Assignment',
      categoryId: mockCategoryId,
    };

    it('should create an assignment successfully', async () => {
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockAssignmentsRepo.create as jest.Mock).mockResolvedValue(
        mockAssignment,
      );

      const result = await service.createAssignment(
        mockInstructorId,
        mockLectureId,
        createDto,
      );

      expect(mockCategoryRepo.findById).toHaveBeenCalledWith(
        createDto.categoryId,
      );
      expect(mockAssignmentsRepo.create).toHaveBeenCalledWith({
        instructorId: mockInstructorId,
        lectureId: mockLectureId,
        ...createDto,
      });
      expect(result).toEqual(mockAssignment);
    });

    it('should throw NotFoundException if category not found', async () => {
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createAssignment(mockInstructorId, mockLectureId, createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if category belongs to another instructor', async () => {
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      await expect(
        service.createAssignment(mockInstructorId, mockLectureId, createDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getAssignments', () => {
    it('should return assignments', async () => {
      const assignments = [mockAssignment];
      (mockAssignmentsRepo.findByInstructorId as jest.Mock).mockResolvedValue(
        assignments,
      );

      const result = await service.getAssignments(
        mockInstructorId,
        mockLectureId,
      );

      expect(mockAssignmentsRepo.findByInstructorId).toHaveBeenCalledWith(
        mockInstructorId,
        mockLectureId,
      );
      expect(result).toEqual(assignments);
    });
  });

  describe('getAssignmentById', () => {
    it('should return assignment if found and authorized', async () => {
      (mockAssignmentsRepo.findByIdWithResults as jest.Mock).mockResolvedValue(
        mockAssignment,
      );

      const result = await service.getAssignmentById(
        mockAssignment.id,
        mockInstructorId,
      );

      expect(mockAssignmentsRepo.findByIdWithResults).toHaveBeenCalledWith(
        mockAssignment.id,
      );
      expect(result).toEqual(mockAssignment);
    });

    it('should throw NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findByIdWithResults as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.getAssignmentById(mockAssignment.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor does not match', async () => {
      (mockAssignmentsRepo.findByIdWithResults as jest.Mock).mockResolvedValue({
        ...mockAssignment,
        instructorId: 'other-instructor',
      });

      await expect(
        service.getAssignmentById(mockAssignment.id, mockInstructorId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateAssignment', () => {
    const updateDto = {
      title: 'Updated Title',
    };

    it('should update assignment successfully', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockAssignmentsRepo.update as jest.Mock).mockResolvedValue({
        ...mockAssignment,
        ...updateDto,
      });

      const result = await service.updateAssignment(
        mockAssignment.id,
        mockInstructorId,
        updateDto,
      );

      expect(mockAssignmentsRepo.update).toHaveBeenCalledWith(
        mockAssignment.id,
        updateDto,
      );
      expect(result.title).toBe(updateDto.title);
    });

    it('should throw NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAssignment(
          mockAssignment.id,
          mockInstructorId,
          updateDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should check category permission if categoryId is updated', async () => {
      const updateCategoryDto = { categoryId: 'new-category' };
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockCategoryRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        id: 'new-category',
      });
      (mockAssignmentsRepo.update as jest.Mock).mockResolvedValue({
        ...mockAssignment,
        ...updateCategoryDto,
      });

      await service.updateAssignment(
        mockAssignment.id,
        mockInstructorId,
        updateCategoryDto,
      );

      expect(mockCategoryRepo.findById).toHaveBeenCalledWith('new-category');
      expect(mockAssignmentsRepo.update).toHaveBeenCalledWith(
        mockAssignment.id,
        updateCategoryDto,
      );
    });
  });

  describe('deleteAssignment', () => {
    it('should delete assignment successfully', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockAssignmentsRepo.delete as jest.Mock).mockResolvedValue(
        mockAssignment,
      );

      await service.deleteAssignment(mockAssignment.id, mockInstructorId);

      expect(mockAssignmentsRepo.delete).toHaveBeenCalledWith(
        mockAssignment.id,
      );
    });

    it('should throw NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteAssignment(mockAssignment.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
