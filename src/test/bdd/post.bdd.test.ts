import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import { mockInstructor, mockLectures } from '../fixtures/lectures.fixture.js';
import { mockProfiles } from '../fixtures/profile.fixture.js';

describe('Post & Comment BDD Tests - @integration', () => {
  const instructor = mockInstructor;
  const student = mockProfiles.student;
  const app = createTestApp({ useRouter: true });

  const instructorPostsService = container.instructorPostsService;
  const studentPostsService = container.studentPostsService;
  const commentsService = container.commentsService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Scenario: Instructor creates a notice and student comments on it
   * Given: An authenticated instructor and a student
   * When: The instructor creates an instructor post for a lecture
   * Then: The post should be created
   * When: The student views the post and adds a comment
   * Then: The comment should be recorded
   */
  describe('Scenario: Instructor Post and Student Comment', () => {
    const lectureId = mockLectures.basic.id;
    const postId = 'post-1';

    it('should allow instructor to post and student to comment', async () => {
      // 1. Instructor creates post
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: { id: instructor.userId!, email: 'i@e.com', userType: UserType.INSTRUCTOR, name: 'I' },
        session: { id: 's1' } as any,
        profile: instructor as any,
      });

      jest.spyOn(instructorPostsService, 'createPost').mockResolvedValue({
        id: postId, title: 'Notice', content: 'Hello'
      } as any);

      const res1 = await request(app)
        .post(`/api/mgmt/v1/lectures/${lectureId}/instructor-posts`)
        .send({ title: 'Notice', content: 'Hello', scope: 'ALL' });

      expect(res1.status).toBe(201);

      // 2. Student adds comment
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: { id: student.userId!, email: 's@e.com', userType: UserType.STUDENT, name: 'S' },
        session: { id: 's2' } as any,
        profile: student as any,
      });

      jest.spyOn(commentsService, 'createComment').mockResolvedValue({
        id: 'c-1', content: 'Thank you'
      } as any);

      const res2 = await request(app)
        .post(`/api/svc/v1/instructor-posts/${postId}/comments`)
        .send({ content: 'Thank you' });

      expect(res2.status).toBe(201);
      expect(res2.body.data.comment.content).toBe('Thank you');
    });
  });

  /**
   * Scenario: Student creates a question and instructor replies
   * Given: An authenticated student and an instructor
   * When: The student creates a student post
   * Then: The post is created
   * When: The instructor replies with a comment
   * Then: The comment is recorded
   */
  describe('Scenario: Student Question and Instructor Reply', () => {
    const postId = 'post-student-1';

    it('should allow student to ask and instructor to reply', async () => {
      // 1. Student creates post
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: { id: student.userId!, email: 's@e.com', userType: UserType.STUDENT, name: 'S' },
        session: { id: 's2' } as any,
        profile: student as any,
      });

      jest.spyOn(studentPostsService, 'createPost').mockResolvedValue({
        id: postId, title: 'Question', content: 'How to?'
      } as any);

      const res1 = await request(app)
        .post('/api/svc/v1/student-posts')
        .send({ title: 'Question', content: 'How to?', lectureId: mockLectures.basic.id });

      expect(res1.status).toBe(201);

      // 2. Instructor adds comment
      jest.spyOn(container.authService, 'getSession').mockResolvedValue({
        user: { id: instructor.userId!, email: 'i@e.com', userType: UserType.INSTRUCTOR, name: 'I' },
        session: { id: 's1' } as any,
        profile: instructor as any,
      });

      jest.spyOn(commentsService, 'createComment').mockResolvedValue({
        id: 'c-2', content: 'Here is the answer'
      } as any);

      const res2 = await request(app)
        .post(`/api/mgmt/v1/student-posts/${postId}/comments`)
        .send({ content: 'Here is the answer' });

      expect(res2.status).toBe(201);
      expect(res2.body.data.comment.content).toBe('Here is the answer');
    });
  });
});
