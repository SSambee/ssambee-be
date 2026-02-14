import { ScheduleCategoryService } from './schedule-categories.service.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('ScheduleCategoryService - @unit', () => {
  let service: ScheduleCategoryService;
  let mockRepo: Partial<ScheduleCategoryRepository>;
  const mockPrisma = {} as unknown as PrismaClient;

  const mockInstructorId = 'instructor-1';
  const mockCategory = {
    id: 'category-1',
    instructorId: mockInstructorId,
    name: '수학',
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

  describe('[카테고리 생성] createCategory', () => {
    const createDto = { name: '수학', color: '#FF0000' };

    it('성공적으로 카테고리를 생성해야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );
      (mockRepo.create as jest.Mock).mockResolvedValue(mockCategory);

      // 실행 (Act)
      const result = await service.createCategory(mockInstructorId, createDto);

      // 검증 (Assert)
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

    it('이름이 중복된 경우 ConflictException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('색상이 중복된 경우 ConflictException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        mockCategory,
      );

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });

    it('Prisma 유니크 제약 조건 에러(P2002) 발생 시 ConflictException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '1.0.0' },
      );
      (mockRepo.create as jest.Mock).mockRejectedValue(p2002Error);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.createCategory(mockInstructorId, createDto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('[강사별 카테고리 목록 조회] getCategoriesByInstructor', () => {
    it('카테고리 목록을 반환해야 한다', async () => {
      // 준비 (Arrange)
      const categories = [mockCategory];
      (mockRepo.findByInstructorId as jest.Mock).mockResolvedValue(categories);

      // 실행 (Act)
      const result = await service.getCategoriesByInstructor(mockInstructorId);

      // 검증 (Assert)
      expect(mockRepo.findByInstructorId).toHaveBeenCalledWith(
        mockInstructorId,
      );
      expect(result).toEqual(categories);
    });
  });

  describe('[카테고리 수정] updateCategory', () => {
    const updateDto = { name: '과학', color: '#00FF00' };

    it('성공적으로 카테고리를 수정해야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.findByInstructorIdAndName as jest.Mock).mockResolvedValue(null);
      (mockRepo.findByInstructorIdAndColor as jest.Mock).mockResolvedValue(
        null,
      );
      (mockRepo.update as jest.Mock).mockResolvedValue({
        ...mockCategory,
        ...updateDto,
      });

      // 실행 (Act)
      const result = await service.updateCategory(
        mockCategory.id,
        mockInstructorId,
        updateDto,
      );

      // 검증 (Assert)
      expect(mockRepo.update).toHaveBeenCalledWith(mockCategory.id, updateDto);
      expect(result.name).toBe(updateDto.name);
    });

    it('카테고리를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('타 강사의 카테고리를 수정하려 하면 ForbiddenException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        instructorId: 'other-instructor',
      });

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.updateCategory(mockCategory.id, mockInstructorId, updateDto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('[카테고리 삭제] deleteCategory', () => {
    it('성공적으로 카테고리를 삭제해야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findById as jest.Mock).mockResolvedValue(mockCategory);
      (mockRepo.delete as jest.Mock).mockResolvedValue(mockCategory);

      // 실행 (Act)
      await service.deleteCategory(mockCategory.id, mockInstructorId);

      // 검증 (Assert)
      expect(mockRepo.delete).toHaveBeenCalledWith(mockCategory.id);
    });

    it('삭제할 카테고리를 찾을 수 없으면 NotFoundException을 던져야 한다', async () => {
      // 준비 (Arrange)
      (mockRepo.findById as jest.Mock).mockResolvedValue(null);

      // 실행 및 검증 (Act & Assert)
      await expect(
        service.deleteCategory(mockCategory.id, mockInstructorId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
