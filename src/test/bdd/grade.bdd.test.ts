import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import path from 'path';
import { mockInstructor, mockLectures } from '../fixtures/lectures.fixture.js';
import { mockProfiles } from '../fixtures/profile.fixture.js';
import { mockExams } from '../fixtures/exams.fixture.js';
import {
  ForbiddenException,
  BadRequestException,
} from '../../err/http.exception.js';

describe('Grade BDD Tests - @integration', () => {
  const instructor = mockInstructor;
  const student = mockProfiles.student;

  const app = createTestApp({ useRouter: true });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Scenario: Instructor submits a grade
   * Given: An authenticated instructor
   * And: An exam for a lecture
   * When: The instructor submits answers and scores for a student
   * Then: The grade should be successfully recorded
   */
  describe('Scenario: Instructor submits a grade', () => {
    const examId = mockExams.basic.id;
    const gradingData = {
      lectureEnrollmentId: 'le-1',
      answers: [
        { questionNumber: 1, submittedAnswer: '1', isCorrect: true },
        { questionNumber: 2, submittedAnswer: '2', isCorrect: true },
      ],
      totalScore: 20,
      correctCount: 2,
    };

    it('should submit grading successfully', async () => {
      // Mock instructor session for this request
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId!,
          email: 'instructor@example.com',
          userType: UserType.INSTRUCTOR,
          name: 'Instructor',
        },
        session: {
          id: 's1',
          token: 't1',
          userId: instructor.userId!,
          expiresAt: new Date(),
        } as any,
        profile: instructor as any,
      });

      const submitSpy = jest
        .spyOn(container.gradesService, 'submitGrading')
        .mockResolvedValue({
          id: 'g-1',
          score: 20,
          isPass: true,
        } as any);

      const res = await request(app)
        .post(`/api/mgmt/v1/exams/${examId}/grades`)
        .send(gradingData);

      expect(res.status).toBe(200);
      expect(res.body.data.score).toBe(20);
      expect(submitSpy).toHaveBeenCalledWith(
        examId,
        expect.anything(),
        UserType.INSTRUCTOR,
        instructor.id,
      );
    });
  });

  /**
   * Scenario: Student views their grade
   * Given: An authenticated student
   * When: The student requests their grade for a specific lecture enrollment
   * Then: They should see their exam scores and statistics
   */
  describe('Scenario: Student views their grade', () => {
    const lectureEnrollmentId = 'le-1';

    it('should allow student to view their grades', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: student.userId!,
          email: 'student@example.com',
          userType: UserType.STUDENT,
          name: 'Student',
        },
        session: {
          id: 's2',
          token: 't2',
          userId: student.userId!,
          expiresAt: new Date(),
        } as any,
        profile: student as any,
      });

      const getGradesSpy = jest
        .spyOn(container.gradesService, 'getGradesByLectureEnrollment')
        .mockResolvedValue([
          {
            id: 'g-1',
            examTitle: 'Midterm',
            lectureTitle: 'Math 101',
            score: 95,
            isPass: true,
            rank: 1,
            average: 80,
            date: new Date(),
          },
        ] as any);

      const res = await request(app).get(
        `/api/svc/v1/enrollments/lectures/${lectureEnrollmentId}/grades`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data.grades).toHaveLength(1);
      expect(res.body.data.grades[0].score).toBe(95);
      expect(getGradesSpy).toHaveBeenCalledWith(
        lectureEnrollmentId,
        UserType.STUDENT,
        student.id,
      );
    });

    it("should fail if a student tries to view another student's grade", async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: 'other-student-id',
          email: 'other@example.com',
          userType: UserType.STUDENT,
          name: 'Other Student',
        },
        session: {
          id: 's3',
          token: 't3',
          userId: 'other-student-id',
          expiresAt: new Date(),
        } as any,
        profile: { id: 'other-profile-id' } as any,
      });

      jest
        .spyOn(container.gradesService, 'getGradesByLectureEnrollment')
        .mockRejectedValue(
          new ForbiddenException('본인의 수강 정보만 조회할 수 있습니다.'),
        );

      const res = await request(app).get(
        `/api/svc/v1/enrollments/lectures/${lectureEnrollmentId}/grades`,
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('본인의 수강 정보만 조회할 수 있습니다');
    });

    it('should allow student to view detailed grade with question statistics', async () => {
      const gradeId = 'g-1';
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: student.userId!,
          email: 'student@example.com',
          userType: UserType.STUDENT,
          name: 'Student',
        },
        session: { id: 's2', token: 't2', userId: student.userId!, expiresAt: new Date() } as any,
        profile: student as any,
      });

      jest.spyOn(container.gradesService, 'getGradeDetail').mockResolvedValue({
        studentName: 'Student Name',
        score: 95,
        rank: 1,
        average: 80,
        examTitle: 'Midterm',
        questionStatistics: [
          { questionNumber: 1, score: 10, correctRate: 90, choiceRates: { '1': 90, '2': 10 } }
        ]
      } as any);

      const res = await request(app).get(`/api/svc/v1/grades/${gradeId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.grade.score).toBe(95);
      expect(res.body.data.grade.questionStatistics).toBeDefined();
    });
  });

  /**
   * Scenario: Instructor uploads grade report file
   * Given: An authenticated instructor
   * When: The instructor uploads a PDF report for a student's grade
   * Then: The file should be saved and the URL returned
   */
  describe('Scenario: Instructor uploads grade report file', () => {
    const gradeId = 'g-1';

    it('should upload a report file successfully', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId!,
          email: 'instructor@example.com',
          userType: UserType.INSTRUCTOR,
          name: 'Instructor',
        },
        session: { id: 's1', token: 't1', userId: instructor.userId!, expiresAt: new Date() } as any,
        profile: instructor as any,
      });

      const uploadSpy = jest.spyOn(container.gradesService, 'uploadGradeReportFile').mockResolvedValue({
        reportUrl: 'https://cdn.example.com/reports/r1.pdf'
      });

      const res = await request(app)
        .post(`/api/mgmt/v1/grades/${gradeId}/report/file-upload`)
        .attach('file', Buffer.from('fake pdf content'), 'report.pdf');

      expect(res.status).toBe(200);
      expect(res.body.data.reportUrl).toBe('https://cdn.example.com/reports/r1.pdf');
      expect(uploadSpy).toHaveBeenCalled();
    });

    it('should fail if no file is attached', async () => {
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: {
          id: instructor.userId!,
          email: 'instructor@example.com',
          userType: UserType.INSTRUCTOR,
          name: 'Instructor',
        },
        session: {
          id: 's1',
          token: 't1',
          userId: instructor.userId!,
          expiresAt: new Date(),
        } as any,
        profile: instructor as any,
      });

      const res = await request(app).post(
        `/api/mgmt/v1/grades/${gradeId}/report/file-upload`,
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('파일이 첨부되지 않았습니다');
    });
  });
});
