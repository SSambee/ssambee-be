import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { seedActiveInstructorEntitlement } from '../utils/billing-test.util.js';
import { prisma } from '../../config/db.config.js';
import { fakerKO as faker } from '@faker-js/faker';
import type { Instructor, Lecture } from '../../generated/prisma/client.js';

describe('시험 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  beforeAll(async () => {});

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  describe('시나리오: 강사가 시험을 생성', () => {
    let instructor: Instructor;
    let lecture: Lecture;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();

      const user = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: '강사',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: user.id, phoneNumber: faker.phone.number() },
      });
      await seedActiveInstructorEntitlement(instructor.id);
      lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: '테스트 강의' },
      });
    });

    it('시험 생성이 성공해야 한다', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId,
          email: 'i@e.com',
          userType: UserType.INSTRUCTOR,
          name: '강사',
        },
        session: {
          id: 's1',
          expiresAt: new Date(),
          token: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: instructor.userId,
          ipAddress: null,
          userAgent: null,
        },
        profile: instructor,
      });

      const examData = {
        title: '신규 시험',
        examDate: new Date().toISOString(),
        description: '시험 설명',
        cutoffScore: 60,
        questions: [
          {
            questionNumber: 1,
            type: 'MULTIPLE',
            content: '문제 1',
            score: 10,
            correctAnswer: '1',
          },
        ],
      };

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/${lecture.id}/exams`)
        .send(examData);

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe(examData.title);

      // DB 검증
      const savedExam = await prisma.exam.findFirst({
        where: { lectureId: lecture.id, title: examData.title },
      });
      expect(savedExam).not.toBeNull();

      const questions = await prisma.question.findMany({
        where: { examId: savedExam!.id },
      });
      expect(questions).toHaveLength(1);
      expect(questions[0].content).toBe('문제 1');
    });
  });

  describe('시나리오: 강사가 시험 목록 조회', () => {
    let instructor: Instructor;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      const user = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: 'i@e.com',
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: user.id, phoneNumber: faker.phone.number() },
      });
      await seedActiveInstructorEntitlement(instructor.id);
      const lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L' },
      });
      await prisma.exam.create({
        data: {
          lecture: { connect: { id: lecture.id } },
          instructor: { connect: { id: instructor.id } },
          title: 'Exam 1',
          examDate: new Date(),
        },
      });
    });

    it('시험 목록을 조회할 수 있어야 한다', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId,
          email: 'i@e.com',
          userType: UserType.INSTRUCTOR,
          name: 'I',
        },
        session: {
          id: 's1',
          expiresAt: new Date(),
          token: 't1',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: instructor.userId,
          ipAddress: null,
          userAgent: null,
        },
        profile: instructor,
      });

      const res = await request(app).get('/api/mgmt/v1/exams');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toBe('Exam 1');
    });
  });
});
