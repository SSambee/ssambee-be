import { AssignmentResultsService } from './assignment-results.service.js';
import { AssignmentResultsRepository } from '../repos/assignment-results.repo.js';
import { AssignmentsRepository } from '../repos/assignments.repo.js';
import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('AssignmentResultsService', () => {
  let service: AssignmentResultsService;
  let mockAssignmentResultsRepo: Partial<AssignmentResultsRepository>;
  let mockAssignmentsRepo: Partial<AssignmentsRepository>;
  let mockLectureEnrollmentsRepo: Partial<LectureEnrollmentsRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockLectureId = 'lecture-1';
  const mockAssignmentId = 'assignment-1';
  const mockEnrollmentId = 'enrollment-1';
  const mockResultIndex = 1;

  const mockAssignment = {
    id: mockAssignmentId,
    instructorId: mockInstructorId,
    lectureId: mockLectureId,
    title: 'Test Assignment',
    category: {
      resultPresets: ['A', 'B', 'C'],
    },
  };

  const mockLectureEnrollment = {
    id: mockEnrollmentId,
    lectureId: mockLectureId,
  };

  const mockAssignmentResult = {
    assignmentId: mockAssignmentId,
    lectureEnrollmentId: mockEnrollmentId,
    resultIndex: mockResultIndex,
    assignment: mockAssignment,
    lectureEnrollment: mockLectureEnrollment,
  };

  beforeEach(() => {
    mockAssignmentResultsRepo = {
      create: jest.fn(),
      findByAssignmentAndEnrollment: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    mockAssignmentsRepo = {
      findById: jest.fn(),
    };
    mockLectureEnrollmentsRepo = {
      findById: jest.fn(),
    };

    service = new AssignmentResultsService(
      mockAssignmentResultsRepo as AssignmentResultsRepository,
      mockAssignmentsRepo as AssignmentsRepository,
      mockLectureEnrollmentsRepo as LectureEnrollmentsRepository,
      mockPrisma,
    );
  });

  describe('createResult', () => {
    const createDto = { resultIndex: 1 };

    it('should create a result successfully', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockLectureEnrollmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockLectureEnrollment,
      );
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(null);
      (mockAssignmentResultsRepo.create as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );

      const result = await service.createResult(
        mockInstructorId,
        mockAssignmentId,
        mockEnrollmentId,
        createDto,
      );

      expect(mockAssignmentResultsRepo.create).toHaveBeenCalledWith({
        assignmentId: mockAssignmentId,
        lectureEnrollmentId: mockEnrollmentId,
        resultIndex: createDto.resultIndex,
      });
      expect(result).toEqual(mockAssignmentResult);
    });

    it('should throw NotFoundException if assignment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          createDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if assignment belongs to another instructor', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue({
        ...mockAssignment,
        instructorId: 'other-instructor',
      });

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          createDto,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if lecture enrollment not found', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockLectureEnrollmentsRepo.findById as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          createDto,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if assignment and enrollment belong to different lectures', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockLectureEnrollmentsRepo.findById as jest.Mock).mockResolvedValue({
        ...mockLectureEnrollment,
        lectureId: 'other-lecture',
      });

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          createDto,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if resultIndex is out of range', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockLectureEnrollmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockLectureEnrollment,
      );

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          { resultIndex: 10 }, // Out of range
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if result already exists', async () => {
      (mockAssignmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignment,
      );
      (mockLectureEnrollmentsRepo.findById as jest.Mock).mockResolvedValue(
        mockLectureEnrollment,
      );
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(mockAssignmentResult);

      await expect(
        service.createResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          createDto,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getResult', () => {
    it('should return result if found and authorized', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(mockAssignmentResult);

      const result = await service.getResult(
        mockInstructorId,
        mockAssignmentId,
        mockEnrollmentId,
      );

      expect(result).toEqual(mockAssignmentResult);
    });

    it('should throw NotFoundException if result not found', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(null);

      await expect(
        service.getResult(mockInstructorId, mockAssignmentId, mockEnrollmentId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if instructor does not match', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue({
        ...mockAssignmentResult,
        assignment: { ...mockAssignment, instructorId: 'other-instructor' },
      });

      await expect(
        service.getResult(mockInstructorId, mockAssignmentId, mockEnrollmentId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateResult', () => {
    const updateDto = { resultIndex: 2 };

    it('should update result successfully', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(mockAssignmentResult);
      (mockAssignmentResultsRepo.update as jest.Mock).mockResolvedValue({
        ...mockAssignmentResult,
        ...updateDto,
      });

      const result = await service.updateResult(
        mockInstructorId,
        mockAssignmentId,
        mockEnrollmentId,
        updateDto,
      );

      expect(mockAssignmentResultsRepo.update).toHaveBeenCalledWith(
        mockAssignmentId,
        mockEnrollmentId,
        updateDto,
      );
      expect(result.resultIndex).toBe(updateDto.resultIndex);
    });

    it('should throw BadRequestException if new resultIndex is out of range', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(mockAssignmentResult);

      await expect(
        service.updateResult(
          mockInstructorId,
          mockAssignmentId,
          mockEnrollmentId,
          { resultIndex: 10 },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteResult', () => {
    it('should delete result successfully', async () => {
      (
        mockAssignmentResultsRepo.findByAssignmentAndEnrollment as jest.Mock
      ).mockResolvedValue(mockAssignmentResult);
      (mockAssignmentResultsRepo.delete as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );

      await service.deleteResult(
        mockInstructorId,
        mockAssignmentId,
        mockEnrollmentId,
      );

      expect(mockAssignmentResultsRepo.delete).toHaveBeenCalledWith(
        mockAssignmentId,
        mockEnrollmentId,
      );
    });
  });
});
