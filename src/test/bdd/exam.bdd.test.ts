import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import { mockInstructor, mockLectures } from '../fixtures/lectures.fixture.js';
import { mockExams } from '../fixtures/exams.fixture.js';

describe('Exam BDD Tests - @integration', () => {
  const instructor = mockInstructor;
  const app = createTestApp({ useRouter: true });
  const examsService = container.examsService;

  beforeEach(() => {
    jest.clearAllMocks();
    // requireAuth Mocking
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
  });

  /**
   * Scenario: Instructor creates an exam for a lecture
   * Given: An authenticated instructor
   * And: A lecture owned by the instructor
   * When: The instructor creates an exam with title and questions
   * Then: A new exam should be recorded
   */
  describe('Scenario: Instructor creates an exam', () => {
    const lectureId = mockLectures.basic.id;
    const examData = {
      title: 'New Exam',
      examDate: new Date(),
      description: 'Test Exam',
      cutoffScore: 60,
      questions: [
        { questionNumber: 1, type: 'CHOICE', content: 'Q1', score: 10, correctAnswer: '1' }
      ]
    };

    it('should create an exam successfully', async () => {
      const createSpy = jest.spyOn(examsService, 'createExam').mockResolvedValue({
        id: 'exam-1',
        ...examData,
        lectureId
      } as any);

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/${lectureId}/exams`)
        .send(examData);

      expect(res.status).toBe(201);
      expect(res.body.data.exam.title).toBe(examData.title);
      expect(createSpy).toHaveBeenCalled();
    });
  });

  /**
   * Scenario: Instructor views exam list
   * Given: An authenticated instructor
   * When: The instructor requests all exams
   * Then: They should see a list of exams they created
   */
  describe('Scenario: Instructor views exam list', () => {
    it('should retrieve exam list', async () => {
      jest.spyOn(examsService, 'getExams').mockResolvedValue([
        { id: 'exam-1', title: 'Exam 1', lecture: { title: 'Lecture 1' } }
      ] as any);

      const res = await request(app).get('/api/mgmt/v1/exams');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Exam 1');
    });
  });
});
