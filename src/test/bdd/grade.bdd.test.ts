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
  LectureEnrollment,
  Exam,
  Grade,
  Question,
} from '../../generated/prisma/client.js';

describe('성적 BDD 테스트 - @integration', () => {
  const app = createTestApp({ useRouter: true });

  beforeAll(async () => {});

  afterAll(async () => {
    await dbTestUtil.disconnect();
  });

  describe('시나리오: 강사가 성적을 제출', () => {
    let instructor: Instructor;
    let enrollment: LectureEnrollment;
    let exam: Exam;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();

      const iUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: iUser.id, phoneNumber: faker.phone.number() },
      });
      const lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L' },
      });
      const e = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'S',
          studentPhone: faker.phone.number(),
          school: 'X고',
          schoolYear: '고1',
          parentPhone: '010-0000-0000',
        },
      });
      enrollment = await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: e.id },
      });
      exam = await prisma.exam.create({
        data: {
          lecture: { connect: { id: lecture.id } },
          instructor: { connect: { id: instructor.id } },
          title: 'E',
          examDate: new Date(),
        },
      });
      await prisma.question.create({
        data: {
          exam: {
            connect: { lectureId_id: { lectureId: lecture.id, id: exam.id } },
          },
          questionNumber: 1,
          type: 'MULTIPLE',
          content: 'Q1',
          score: 10,
          correctAnswer: '1',
        },
      });
    });

    it('성적 제출이 성공해야 한다', async () => {
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

      const gradingData = {
        lectureEnrollmentId: enrollment.id,
        answers: [{ questionNumber: 1, submittedAnswer: '1', isCorrect: true }],
        totalScore: 10,
        correctCount: 1,
      };

      const res = await request(app)
        .post(`/api/mgmt/v1/exams/${exam.id}/grades`)
        .send(gradingData);

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(10);

      const savedGrade = await prisma.grade.findFirst({
        where: { examId: exam.id, lectureEnrollmentId: enrollment.id },
      });
      expect(savedGrade).toBeDefined();
      expect(savedGrade?.score).toBe(10);
    });
  });

  describe('시나리오: 학생이 자신의 성적을 조회', () => {
    let student: AppStudent;
    let enrollment: LectureEnrollment;
    let grade: Grade;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();
      const sUser = await prisma.user.create({
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
        data: {
          userId: sUser.id,
          phoneNumber: faker.phone.number(),
          school: 'X고',
          schoolYear: '고1',
        },
      });

      const iUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const instructor = await prisma.instructor.create({
        data: { userId: iUser.id, phoneNumber: faker.phone.number() },
      });
      const lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L' },
      });
      const e = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'S',
          studentPhone: faker.phone.number(),
          school: 'X고',
          schoolYear: '고1',
          parentPhone: '010-0000-0000',
          appStudentId: student.id,
        },
      });
      enrollment = await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: e.id },
      });
      const exam = await prisma.exam.create({
        data: {
          lecture: { connect: { id: lecture.id } },
          instructor: { connect: { id: instructor.id } },
          title: 'E',
          examDate: new Date(),
        },
      });
      grade = await prisma.grade.create({
        data: {
          exam: {
            connect: { lectureId_id: { lectureId: lecture.id, id: exam.id } },
          },
          lectureEnrollment: { connect: { id: enrollment.id } },
          score: 95,
          isPass: true,
        },
      });
    });

    it('학생이 자신의 성적을 조회할 수 있어야 한다', async () => {
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

      const res = await request(app).get(
        `/api/svc/v1/enrollments/lectures/${enrollment.id}/grades`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.grades.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.grades[0].score).toBe(95);
    });

    it('학생이 문항별 통계가 포함된 상세 성적을 조회할 수 있어야 한다', async () => {
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

      const res = await request(app).get(`/api/svc/v1/grades/${grade.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.grade.score).toBe(95);
    });
  });

  describe('시나리오: 강사가 성적 보고서 파일을 업로드', () => {
    let instructor: Instructor;
    let grade: Grade;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      const iUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: iUser.id, phoneNumber: faker.phone.number() },
      });
      const lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L' },
      });
      const e = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'S',
          studentPhone: faker.phone.number(),
          school: 'X고',
          schoolYear: '고1',
          parentPhone: '010-0000-0000',
        },
      });
      const enrollment = await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: e.id },
      });
      const exam = await prisma.exam.create({
        data: {
          lecture: { connect: { id: lecture.id } },
          instructor: { connect: { id: instructor.id } },
          title: 'E',
          examDate: new Date(),
        },
      });
      grade = await prisma.grade.create({
        data: {
          exam: {
            connect: { lectureId_id: { lectureId: lecture.id, id: exam.id } },
          },
          lectureEnrollment: { connect: { id: enrollment.id } },
          score: 80,
        },
      });
    });

    it('보고서 파일 업로드가 성공해야 한다', async () => {
      // S3 업로드 모킹 (파일 스토리지는 비싸니까)
      jest
        .spyOn(container.fileStorageService, 'upload')
        .mockResolvedValue('https://fake-url.com/reports/r1.pdf');

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
        .post(`/api/mgmt/v1/grades/${grade.id}/report/file-upload`)
        .attach('file', Buffer.from('fake pdf content'), 'report.pdf');

      expect(res.status).toBe(200);
      expect(res.body.data.reportUrl).toBeDefined();

      const updatedReport = await prisma.gradeReport.findUnique({
        where: { gradeId: grade.id },
      });
      expect(updatedReport?.reportUrl).toBe(
        'https://fake-url.com/reports/r1.pdf',
      );
    });
  });

  describe('시나리오: 강사가 성적 리포트를 조회', () => {
    let instructor: Instructor;
    let grade: Grade;
    let question: Question;

    beforeEach(async () => {
      await dbTestUtil.truncateAll();
      jest.clearAllMocks();

      const iUser = await prisma.user.create({
        data: {
          id: faker.string.uuid(),
          email: faker.internet.email(),
          name: 'I',
          userType: UserType.INSTRUCTOR,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      instructor = await prisma.instructor.create({
        data: { userId: iUser.id, phoneNumber: faker.phone.number() },
      });
      const lecture = await prisma.lecture.create({
        data: { instructorId: instructor.id, title: 'L' },
      });
      const e = await prisma.enrollment.create({
        data: {
          instructorId: instructor.id,
          studentName: 'S',
          studentPhone: faker.phone.number(),
          school: 'X고',
          schoolYear: '고1',
          parentPhone: '010-0000-0000',
        },
      });
      const enrollment = await prisma.lectureEnrollment.create({
        data: { lectureId: lecture.id, enrollmentId: e.id },
      });
      const exam = await prisma.exam.create({
        data: {
          lecture: { connect: { id: lecture.id } },
          instructor: { connect: { id: instructor.id } },
          title: 'E',
          examDate: new Date(),
        },
      });
      question = await prisma.question.create({
        data: {
          exam: {
            connect: { lectureId_id: { lectureId: lecture.id, id: exam.id } },
          },
          questionNumber: 1,
          type: 'MULTIPLE',
          content: 'Q1',
          score: 10,
          correctAnswer: '1',
          source: 'EBS 수특',
          category: '문학',
        },
      });
      await prisma.questionStatistic.create({
        data: {
          examId: exam.id,
          questionId: question.id,
          totalSubmissions: 10,
          correctRate: 70,
        },
      });
      grade = await prisma.grade.create({
        data: {
          exam: {
            connect: { lectureId_id: { lectureId: lecture.id, id: exam.id } },
          },
          lectureEnrollment: { connect: { id: enrollment.id } },
          score: 80,
          isPass: true,
        },
      });
      await prisma.studentAnswer.create({
        data: {
          lectureId: lecture.id,
          lectureEnrollmentId: enrollment.id,
          questionId: question.id,
          submittedAnswer: '1',
          isCorrect: true,
        },
      });
    });

    it('문항별 출처가 응답에 포함되어야 한다', async () => {
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

      const res = await request(app).get(
        `/api/mgmt/v1/grades/${grade.id}/report`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.questions).toHaveLength(1);
      expect(res.body.data.questions[0].source).toBe('EBS 수특');
      expect(res.body.data.questions[0].questionNumber).toBe(1);
    });
  });
});
