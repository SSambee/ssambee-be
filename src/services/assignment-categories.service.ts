import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { AssignmentCategoryRepository } from '../repos/assignment-categories.repo.js';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '../err/http.exception.js';

export class AssignmentCategoryService {
  constructor(
    private readonly assignmentCategoryRepo: AssignmentCategoryRepository,
    private readonly prisma: PrismaClient,
  ) {}

  /** 카테고리 생성 */
  async createCategory(
    instructorId: string,
    data: { name: string; resultPresets: string[] },
  ) {
    // 1. 이름 중복 검사 (강사별)
    const existingName =
      await this.assignmentCategoryRepo.findByInstructorIdAndName(
        instructorId,
        data.name,
      );
    if (existingName) {
      throw new ConflictException('이미 존재하는 카테고리 이름입니다.');
    }

    // 2. 생성
    try {
      return await this.assignmentCategoryRepo.create({
        instructorId,
        ...data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 카테고리입니다.');
      }
      throw error;
    }
  }

  /** 강사의 카테고리 목록 조회 */
  async getCategoriesByInstructor(instructorId: string) {
    return this.assignmentCategoryRepo.findByInstructorId(instructorId);
  }

  /** 카테고리 단일 조회 */
  async getCategoryById(id: string, instructorId: string) {
    const category = await this.assignmentCategoryRepo.findById(id);
    if (!category) {
      throw new NotFoundException('카테고리를 찾을 수 없습니다.');
    }
    // 강사 본인이거나 조교인 경우 접근 가능 (Controller에서 instructorId를 넘겨줄 때 조교는 연결된 강사 ID를 넘겨줌)
    if (category.instructorId !== instructorId) {
      throw new ForbiddenException('해당 카테고리에 대한 권한이 없습니다.');
    }
    return category;
  }

  /** 카테고리 수정 */
  async updateCategory(
    id: string,
    instructorId: string,
    data: { name?: string; resultPresets?: string[] },
  ) {
    // 1. 카테고리 존재 및 권한 확인
    const category = await this.getCategoryById(id, instructorId);

    // 2. 이름 변경 시 중복 검사
    if (data.name && data.name !== category.name) {
      const existingName =
        await this.assignmentCategoryRepo.findByInstructorIdAndName(
          instructorId,
          data.name,
        );
      if (existingName) {
        throw new ConflictException('이미 존재하는 카테고리 이름입니다.');
      }
    }

    // 3. 업데이트
    try {
      return await this.assignmentCategoryRepo.update(id, data);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 카테고리입니다.');
      }
      throw error;
    }
  }

  /** 카테고리 삭제 */
  async deleteCategory(id: string, instructorId: string) {
    // 1. 카테고리 존재 및 권한 확인
    await this.getCategoryById(id, instructorId);

    // 2. 삭제 (DB FK 설정에 의해 관련 과제들도 Cascade 삭제됨)
    return this.assignmentCategoryRepo.delete(id);
  }
}
