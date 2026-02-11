import { PrismaClient } from '../generated/prisma/client.js';
import { ScheduleCategoryRepository } from '../repos/schedule-categories.repo.js';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';

export class ScheduleCategoryService {
  constructor(
    private readonly scheduleCategoryRepo: ScheduleCategoryRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 카테고리 생성 */
  async createCategory(
    instructorId: string,
    data: { name: string; color: string },
  ) {
    // 1. 이름 중복 검사
    const existingName =
      await this.scheduleCategoryRepo.findByInstructorIdAndName(
        instructorId,
        data.name,
      );
    if (existingName) {
      throw new ConflictException('이미 존재하는 카테고리 이름입니다.');
    }

    // 2. 색상 중복 검사
    const existingColor =
      await this.scheduleCategoryRepo.findByInstructorIdAndColor(
        instructorId,
        data.color,
      );
    if (existingColor) {
      throw new ConflictException('이미 존재하는 카테고리 색상입니다.');
    }

    // 3. 생성
    return this.scheduleCategoryRepo.create({
      instructorId,
      ...data,
    });
  }

  /** 강사의 카테고리 목록 조회 */
  async getCategoriesByInstructor(instructorId: string) {
    return this.scheduleCategoryRepo.findByInstructorId(instructorId);
  }

  /** 카테고리 수정 */
  async updateCategory(
    id: string,
    instructorId: string,
    data: { name?: string; color?: string },
  ) {
    // 1. 카테고리 존재 및 권한 확인
    const category = await this.scheduleCategoryRepo.findById(id);
    if (!category) {
      throw new NotFoundException('카테고리를 찾을 수 없습니다.');
    }
    if (category.instructorId !== instructorId) {
      throw new ForbiddenException('해당 카테고리에 대한 권한이 없습니다.');
    }

    // 2. 이름 변경 시 중복 검사
    if (data.name && data.name !== category.name) {
      const existingName =
        await this.scheduleCategoryRepo.findByInstructorIdAndName(
          instructorId,
          data.name,
        );
      if (existingName) {
        throw new ConflictException('이미 존재하는 카테고리 이름입니다.');
      }
    }

    // 3. 색상 변경 시 중복 검사
    if (data.color && data.color !== category.color) {
      const existingColor =
        await this.scheduleCategoryRepo.findByInstructorIdAndColor(
          instructorId,
          data.color,
        );
      if (existingColor) {
        throw new ConflictException('이미 존재하는 카테고리 색상입니다.');
      }
    }

    // 4. 업데이트
    return this.scheduleCategoryRepo.update(id, data);
  }

  /** 카테고리 삭제 */
  async deleteCategory(id: string, instructorId: string) {
    // 1. 카테고리 존재 및 권한 확인
    const category = await this.scheduleCategoryRepo.findById(id);
    if (!category) {
      throw new NotFoundException('카테고리를 찾을 수 없습니다.');
    }
    if (category.instructorId !== instructorId) {
      throw new ForbiddenException('해당 카테고리에 대한 권한이 없습니다.');
    }

    // 2. 삭제 (DB FK 설정에 의해 관련 일정들도 Cascade 삭제됨)
    return this.scheduleCategoryRepo.delete(id);
  }
}
