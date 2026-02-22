import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import { fakerKO as faker } from '@faker-js/faker';
import type {
  Instructor,
  Lecture,
  Enrollment,
} from '../../generated/prisma/client.js';

describe('수강 신청 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  describe('시나리오: 강사가 학생을 강의에 등록', () => {
    let instructor: Instructor;
    let lecture: Lecture;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();

      const user = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: '강사님',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: user.id, phoneNumber: faker.phone.number() },
      });

      lecture = await prisma.lecture.create({
        data: {
          instructorId: instructor.id,
          title: '테스트 강의',
          status: 'REGISTERED',
        },
      });
    });

    it('학생 등록이 성공해야 한다', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId,
          email: 'i@e.com',
          userType: UserType.INSTRUCTOR,
          name: '강사님',
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

      const enrollmentData = {
        studentName: 'New Student',
        studentPhone: '010-1111-2222',
        parentPhone: '010-3333-4444',
        school: '테스트고',
        schoolYear: '고3',
      };

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/${lecture.id}/enrollments`)
        .send(enrollmentData);

      expect(res.status).toBe(201);

      const enrollment = await prisma.enrollment.findFirst({
        where: {
          studentPhone: enrollmentData.studentPhone,
          instructorId: instructor.id,
        },
      });
      expect(enrollment).toBeDefined();
    });

    it('강의가 존재하지 않으면 실패해야 한다', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId,
          email: 'i@e.com',
          userType: UserType.INSTRUCTOR,
          name: '강사님',
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

      const res = await request(app)
        .post('/api/mgmt/v1/lectures/non-existent-id/enrollments')
        .send({
          studentName: 'X',
          studentPhone: '010-0000-0000',
          parentPhone: '010-0000-1111',
          school: 'X고',
          schoolYear: '고1',
        });

      expect(res.status).toBe(404);
    });
  });

  describe('시나리오: 강사가 수강 신청을 삭제', () => {
    let instructor: Instructor;
    let lecture: Lecture;
    let enrollment: Enrollment;

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
        data: { userId: user.id, phoneNumber: '010' },
      });
      lecture = await prisma.lecture.create({
        data: {
          instructorId: instructor.id,
          title: 'L',
          status: 'IN_PROGRESS',
          startAt: new Date(Date.now() - 86400000), // 어제 시작됨
        },
      });
      enrollment = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'S',
          studentPhone: '010',
          school: 'X',
          schoolYear: '고1',
          parentPhone: '0',
        },
      });
      await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: enrollment.id },
      });
    });

    it('강의가 이미 시작된 경우 수강 신청 삭제가 실패해야 한다', async () => {
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

      const res = await request(app).delete(
        `/api/mgmt/v1/lectures/${lecture.id}/enrollments/${enrollment.id}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('시작되었거나');
    });
  });

  describe('시나리오: 강사가 수강 신청 목록 조회', () => {
    let instructor: Instructor;
    let lecture: Lecture;

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
        data: { userId: user.id, phoneNumber: '010' },
      });
      lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L', status: 'REGISTERED' },
      });
      const enrollment = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'Target Student',
          studentPhone: '010-9999',
          school: 'X',
          schoolYear: '고1',
          parentPhone: '0',
        },
      });
      await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: enrollment.id },
      });
    });

    it('강의의 학생 목록을 조회할 수 있어야 한다', async () => {
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

      const res = await request(app)
        .get('/api/mgmt/v1/enrollments')
        .query({ lecture: lecture.id });

      expect(res.status).toBe(200);
      expect(res.body.data.list.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.list[0].studentName).toBe('Target Student');
    });
  });
});
