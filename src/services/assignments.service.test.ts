import { AssignmentsService } from './assignments.service.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let mockAssignmentsRepo: Partial<AssignmentsRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockLectureId = 'lecture-1';
  const mockAssignment = {
    id: 'assignment-1',
    instructorId: mockInstructorId,
    lectureId: mockLectureId,
    resultPresets: ['A', 'B'],
    title: 'Test Assignment',
    createdAt: new Date(),
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
    service = new AssignmentsService(
      mockAssignmentsRepo as AssignmentsRepository,
      mockPrisma,
    );
  });

  describe('createAssignment', () => {
    const createDto = {
      title: 'New Assignment',
      resultPresets: ['A', 'B', 'C'],
    };

    it('성공적으로 과제를 생성해야 한다', async () => {
      (mockAssignmentsRepo.create as jest.Mock).mockResolvedValue(
        mockAssignment,
      );

      const result = await service.createAssignment(
        mockInstructorId,
        mockLectureId,
        createDto,
      );

      expect(mockAssignmentsRepo.create).toHaveBeenCalledWith({
        instructorId: mockInstructorId,
        lectureId: mockLectureId,
        ...createDto,
      });
      expect(result).toEqual(mockAssignment);
    });
  });

  describe('getAssignments', () => {
    it('과제 목록을 반환해야 한다', async () => {
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
    it('권한이 있는 경우 과제를 반환해야 한다', async () => {
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

    it('에러를 던져야 한다:  NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findByIdWithResults as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.getAssignmentById(mockAssignment.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });

    it('권한이 없는 경우 ForbiddenException을 던져야 한다', async () => {
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
      resultPresets: ['C', 'B', 'A'],
    };

    it('성공적으로 과제를 수정해야 한다', async () => {
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

    it('에러를 던져야 한다:  NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateAssignment(
          mockAssignment.id,
          mockInstructorId,
          updateDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('결과 프리셋 수정 시 저장소가 호출되어야 한다', async () => {
      const updatePresetDto = { resultPresets: ['C', 'B', 'A'] };
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockAssignmentsRepo.update as jest.Mock).mockResolvedValue({
        ...mockAssignment,
        ...updatePresetDto,
      });

      await service.updateAssignment(
        mockAssignment.id,
        mockInstructorId,
        updatePresetDto,
      );

      expect(mockAssignmentsRepo.update).toHaveBeenCalledWith(
        mockAssignment.id,
        updatePresetDto,
      );
    });
  });

  describe('deleteAssignment', () => {
    it('성공적으로 과제를 삭제해야 한다', async () => {
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

    it('에러를 던져야 한다:  NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.deleteAssignment(mockAssignment.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
