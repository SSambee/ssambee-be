import { PrismaClient } from '../generated/prisma/client.js';
import { EnrollmentLectureFilter } from '../constants/enrollments.constant.js';
import { EnrollmentsRepository } from './enrollments.repo.js';

describe('EnrollmentsRepository', () => {
  describe('findMany', () => {
    it('lectureFilter가 unassigned이면 활성 강의 연결이 없는 수강생만 조회한다', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        enrollment: {
          findMany,
          count,
        },
      } as unknown as PrismaClient;
      const repo = new EnrollmentsRepository(prisma);

      await repo.findMany('instr-1', {
        page: 1,
        limit: 10,
        lectureFilter: EnrollmentLectureFilter.UNASSIGNED,
      });

      const expectedWhere = expect.objectContaining({
        instructorId: 'instr-1',
        deletedAt: null,
        lectureEnrollments: {
          none: {
            lecture: {
              deletedAt: null,
            },
          },
        },
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
    });
  });
});
