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
  const mockResultId = 'result-1';
  const mockResultIndex = 1;

  const mockAssignment = {
    id: mockAssignmentId,
    instructorId: mockInstructorId,
    lectureId: mockLectureId,
    title: 'Test Assignment',
    resultPresets: ['A', 'B', 'C'],
  };

  const mockLectureEnrollment = {
    id: mockEnrollmentId,
    lectureId: mockLectureId,
  };

  const mockAssignmentResult = {
    id: mockResultId,
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
      findById: jest.fn(),
      updateById: jest.fn(),
      deleteById: jest.fn(),
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

    it('성공적으로 결과를 생성해야 한다', async () => {
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

    it('에러를 던져야 한다:  NotFoundException if assignment not found', async () => {
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

    // ... other createResult tests remain logically similar, omitted for brevity but should be included if rewriting whole file ...
    it('에러를 던져야 한다:  ForbiddenException if assignment belongs to another instructor', async () => {
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

    it('에러를 던져야 한다:  NotFoundException if lecture enrollment not found', async () => {
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

    it('에러를 던져야 한다:  BadRequestException if assignment and enrollment belong to different lectures', async () => {
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

    it('에러를 던져야 한다:  BadRequestException if resultIndex is out of range', async () => {
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
          { resultIndex: 10 },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('에러를 던져야 한다:  ConflictException if result already exists', async () => {
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
    it('권한이 있는 경우 결과를 반환해야 한다', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );

      const result = await service.getResult(mockInstructorId, mockResultId);

      expect(mockAssignmentResultsRepo.findById).toHaveBeenCalledWith(
        mockResultId,
      );
      expect(result).toEqual(mockAssignmentResult);
    });

    it('에러를 던져야 한다:  NotFoundException if result not found', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getResult(mockInstructorId, mockResultId),
      ).rejects.toThrow(NotFoundException);
    });

    it('권한이 없는 경우 ForbiddenException을 던져야 한다', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue({
        ...mockAssignmentResult,
        assignment: { ...mockAssignment, instructorId: 'other-instructor' },
      });

      await expect(
        service.getResult(mockInstructorId, mockResultId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateResult', () => {
    const updateDto = { resultIndex: 2 };

    it('성공적으로 결과를 수정해야 한다', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );
      (mockAssignmentResultsRepo.updateById as jest.Mock).mockResolvedValue({
        ...mockAssignmentResult,
        ...updateDto,
      });

      const result = await service.updateResult(
        mockInstructorId,
        mockResultId,
        updateDto,
      );

      expect(mockAssignmentResultsRepo.updateById).toHaveBeenCalledWith(
        mockResultId,
        updateDto,
      );
      expect(result.resultIndex).toBe(updateDto.resultIndex);
    });

    it('에러를 던져야 한다:  BadRequestException if new resultIndex is out of range', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );

      await expect(
        service.updateResult(mockInstructorId, mockResultId, {
          resultIndex: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteResult', () => {
    it('성공적으로 결과를 삭제해야 한다', async () => {
      (mockAssignmentResultsRepo.findById as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );
      (mockAssignmentResultsRepo.deleteById as jest.Mock).mockResolvedValue(
        mockAssignmentResult,
      );

      await service.deleteResult(mockInstructorId, mockResultId);

      expect(mockAssignmentResultsRepo.deleteById).toHaveBeenCalledWith(
        mockResultId,
      );
    });
  });
});
