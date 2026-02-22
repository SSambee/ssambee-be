import request from 'supertest';
import { createTestApp } from '../utils/app.mock.js';
import { container } from '../../config/container.config.js';
import { UserType } from '../../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '../../err/http.exception.js';
import { mockInstructor, mockLectures } from '../fixtures/lectures.fixture.js';
import {
  mockEnrollments,
  mockEnrollmentWithRelations,
} from '../fixtures/enrollments.fixture.js';

describe('Enrollment BDD Tests - @integration', () => {
  // Mock instructor session
  const instructor = mockInstructor;
  const app = createTestApp({ useRouter: true });

  const enrollmentsService = container.enrollmentsService;
  const authService = container.authService;

  beforeEach(() => {
    jest.clearAllMocks();
    // requireAuth 미들웨어가 authService.getSession을 호출하므로 모킹 필요
    jest.spyOn(authService, 'getSession').mockResolvedValue({
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
  });

  /**
   * Scenario: Instructor registers a student for a lecture
   * Given: An authenticated instructor
   * And: A lecture owned by the instructor
   * When: The instructor registers a student with phone number and name
   * Then: A new enrollment should be created
   * And: The student should be associated with the lecture
   */
  describe('Scenario: Instructor registers a student for a lecture', () => {
    const lectureId = mockLectures.basic.id;
    const enrollmentData = {
      studentName: 'New Student',
      studentPhone: '010-1111-2222',
      parentPhone: '010-3333-4444',
      school: 'Test School',
      schoolYear: '고3',
    };

    it('should register a student successfully', async () => {
      // [When] Register student
      const createSpy = jest
        .spyOn(enrollmentsService, 'createEnrollment')
        .mockResolvedValue({
          id: 'le-1',
          enrollmentId: 'e-1',
          lectureId: lectureId,
          registeredAt: new Date(),
          enrollment: {
            id: 'e-1',
            studentName: enrollmentData.studentName,
            studentPhone: enrollmentData.studentPhone,
          },
        } as any);

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/${lectureId}/enrollments`)
        .send(enrollmentData);

      // [Then] Enrollment created
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrollment.enrollment.studentName).toBe(
        enrollmentData.studentName,
      );
      expect(createSpy).toHaveBeenCalled();
    });

    it('should fail if the lecture does not exist', async () => {
      jest
        .spyOn(enrollmentsService, 'createEnrollment')
        .mockRejectedValue(new NotFoundException('강의를 찾을 수 없습니다.'));

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/non-existent-id/enrollments`)
        .send(enrollmentData);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('강의를 찾을 수 없습니다');
    });

    it('should fail if the instructor does not have permission', async () => {
      // Here we test the middleware or service level permission
      // Since we are mocking the service, we simulate a permission error from service
      jest
        .spyOn(enrollmentsService, 'createEnrollment')
        .mockRejectedValue(new ForbiddenException('해당 권한이 없습니다.'));

      const res = await request(app)
        .post(`/api/mgmt/v1/lectures/${lectureId}/enrollments`)
        .send(enrollmentData);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('권한이 없습니다');
    });
  });

  /**
   * Scenario: Instructor removes enrollment
   * Given: An authenticated instructor
   * When: The instructor tries to remove an enrollment for a lecture that already started
   * Then: It should fail with a 400 error (Business Rule)
   */
  describe('Scenario: Instructor removes enrollment', () => {
    it('should fail to remove enrollment if lecture already started', async () => {
      const lectureId = mockLectures.basic.id;
      const enrollmentId = 'e-1';

      jest
        .spyOn(enrollmentsService, 'removeLectureEnrollment')
        .mockRejectedValue(
          new BadRequestException(
            '이미 시작되었거나 예정되지 않은 강의의 수강 정보는 삭제할 수 없습니다.',
          ),
        );

      const res = await request(app).delete(
        `/api/mgmt/v1/lectures/${lectureId}/enrollments/${enrollmentId}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('시작되었거나');
    });
  });

  /**
   * Scenario: Instructor views enrollment list
   * Given: An authenticated instructor
   * When: The instructor requests the student list for a lecture
   * Then: They should see the registered students
   */
  describe('Scenario: Instructor views enrollment list', () => {
    it('should retrieve student list for a lecture', async () => {
      const lectureId = mockLectures.basic.id;

      jest.spyOn(enrollmentsService, 'getEnrollments').mockResolvedValue({
        enrollments: [
          {
            id: 'e-1',
            studentName: 'Student 1',
            studentPhone: '010-1111-2222',
            attendance: null,
            lecture: mockLectures.basic as any,
          },
        ],
        totalCount: 1,
      } as any);

      const res = await request(app)
        .get('/api/mgmt/v1/enrollments')
        .query({ lecture: lectureId });

      expect(res.status).toBe(200);
      expect(res.body.data.list).toHaveLength(1);
      expect(res.body.data.list[0].studentName).toBe('Student 1');
    });
  });
});
