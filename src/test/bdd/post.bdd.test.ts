import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import { dbTestUtil } from '../utils/db-test.util.js';
import { prisma } from '../../config/db.config.js';
import { fakerKO as faker } from '@faker-js/faker';
import type {
  Instructor,
  AppStudent,
  Lecture,
  Enrollment,
} from '../../generated/prisma/client.js';

describe('게시글 및 댓글 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  beforeAll(async () => {
    // DB 연결 확인 및 준비
  });

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  /**
   * 시나리오: 강사가 공지사항을 작성하고 학생이 댓글을 작성
   * Given: 인증된 강사와 학생
   * When: 강사가 강의에 대한 강사 게시글을 작성하면
   * Then: 게시글이 생성되어야 한다
   * When: 학생이 게시글을 보고 댓글을 작성하면
   * Then: 댓글이 기록되어야 한다
   */
  describe('시나리오: 강사 게시글과 학생 댓글', () => {
    let instructor: Instructor;
    let student: AppStudent;
    let lecture: Lecture;
    let enrollment: Enrollment;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();

      // 1. 강사 생성 (필수 필드 수동 제공)
      const instructorUser = await prisma.user.create({
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
        data: {
          userId: instructorUser.id,
          phoneNumber: faker.phone.number(),
        },
      });

      // 2. 학생 생성
      const studentUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: '학생군',
          userType: UserType.STUDENT,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      student = await prisma.appStudent.create({
        data: {
          userId: studentUser.id,
          phoneNumber: faker.phone.number(),
        },
      });

      // 3. 강의 생성
      lecture = await prisma.lecture.create({
        data: {
          instructorId: instructor.id,
          title: '테스트 강의',
          subject: '수학',
          status: 'IN_PROGRESS',
        },
      });

      // 4. 수강 등록
      enrollment = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          appStudentId: student.id,
          studentName: studentUser.name,
          studentPhone: student.phoneNumber,
          school: '테스트고',
          schoolYear: '1학년',
          parentPhone: faker.phone.number(),
        },
      });

      await prisma.lectureEnrollment.create({
        data: {
          enrollmentId: enrollment.id,
          lectureId: lecture.id,
        },
      });
    });

    it('강사가 게시글을 작성하고 학생이 댓글을 작성할 수 있어야 한다', async () => {
      // 1. 강사로 세션 모킹
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

      // Act: 강사가 게시글 작성
      const postPayload = {
        title: 'Notice',
        content: 'Hello',
        scope: 'GLOBAL',
      };
      const res1 = await request(app)
        .post(`/api/mgmt/v1/lectures/${lecture.id}/instructor-posts/submit`)
        .send(postPayload);

      // Assert
      expect(res1.status).toBe(201);
      const postId = res1.body.data.id;

      const savedPost = await prisma.instructorPost.findUnique({
        where: { id: postId },
      });
      expect(savedPost).toBeDefined();

      // 2. 학생으로 세션 모킹
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: student.userId,
          email: 's@e.com',
          userType: UserType.STUDENT,
          name: '학생군',
        },
        session: {
          id: 's2',
          expiresAt: new Date(),
          token: 't2',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: student.userId,
          ipAddress: null,
          userAgent: null,
        },
        profile: student,
      });

      // Act: 학생이 댓글 작성
      const commentPayload = { content: 'Thank you' };
      const res2 = await request(app)
        .post(`/api/svc/v1/instructor-posts/${postId}/comments`)
        .send(commentPayload);

      // Assert
      expect(res2.status).toBe(201);
      const savedComment = await prisma.comment.findUnique({
        where: { id: res2.body.data.id },
      });
      expect(savedComment?.content).toBe('Thank you');
    });
  });

  describe('시나리오: 학생 질문과 강사 답변', () => {
    let instructor: Instructor;
    let student: AppStudent;
    let lecture: Lecture;
    let enrollment: Enrollment;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();

      const instructorUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'T',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: instructorUser.id, phoneNumber: faker.phone.number() },
      });
      const studentUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'S',
          userType: UserType.STUDENT,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      student = await prisma.appStudent.create({
        data: { userId: studentUser.id, phoneNumber: faker.phone.number() },
      });
      lecture = await prisma.lecture.create({
        data: {
          instructorId: instructor.id,
          title: 'L',
          status: 'IN_PROGRESS',
        },
      });
      enrollment = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          appStudentId: student.id,
          studentName: 'S',
          studentPhone: student.phoneNumber,
          school: 'Sch',
          schoolYear: '1',
          parentPhone: '010',
        },
      });
      await prisma.lectureEnrollment.create({
        data: { enrollmentId: enrollment.id, lectureId: lecture.id },
      });
    });

    it('학생이 질문을 작성하고 강사가 답변할 수 있어야 한다', async () => {
      // 1. 학생으로 세션 모킹
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: student.userId,
          email: 's@e.com',
          userType: UserType.STUDENT,
          name: 'S',
        },
        session: {
          id: 's2',
          expiresAt: new Date(),
          token: 't2',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: student.userId,
          ipAddress: null,
          userAgent: null,
        },
        profile: student,
      });

      // Act
      const res1 = await request(app)
        .post('/api/svc/v1/student-posts')
        .send({ title: 'Question', content: 'How to?', lectureId: lecture.id });

      expect(res1.status).toBe(201);
      const postId = res1.body.data.id;

      // 2. 강사로 세션 모킹
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId,
          email: 'i@e.com',
          userType: UserType.INSTRUCTOR,
          name: 'T',
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

      // Act
      const res2 = await request(app)
        .post(`/api/mgmt/v1/student-posts/${postId}/comments`)
        .send({ content: 'Here is the answer' });

      expect(res2.status).toBe(201);
      const savedComment = await prisma.comment.findUnique({
        where: { id: res2.body.data.id },
      });
      expect(savedComment?.instructorId).toBe(instructor.id);
    });
  });
});
