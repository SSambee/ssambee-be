import { Request, Response, NextFunction } from 'express';
import { EnrollmentsController } from './enrollments.controller.js';
import { UserType } from '../constants/auth.constant.js';
import {
  mockEnrollments,
  mockInstructor,
  mockLectures,
  mockStudents,
} from '../test/fixtures/index.js';
import { toKstIsoString } from '../utils/date.util.js';
import type { ProfileBase } from '../types/auth.types.js';
import type { EnrollmentsService } from '../services/enrollments.service.js';

type GetEnrollmentsResult = Awaited<
  ReturnType<EnrollmentsService['getEnrollments']>
>;
type EnrollmentListItem = GetEnrollmentsResult['enrollments'][number];

type EnrollmentDetailResult = Awaited<
  ReturnType<EnrollmentsService['getEnrollmentDetail']>
>;
type EnrollmentDetailLecture = EnrollmentDetailResult['lectures'][number];

type EnrollmentByIdResult = Awaited<
  ReturnType<EnrollmentsService['getEnrollmentById']>
>;

type EnrollmentLecturesResult = Awaited<
  ReturnType<EnrollmentsService['getEnrollmentLectures']>
>;
type LectureEnrollmentListItem =
  EnrollmentLecturesResult['lectureEnrollments'][number];

type MockRequest = Partial<Request> & {
  user?: {
    id: string;
    email: string;
    userType: UserType;
    name: string;
    image?: string | null;
  };
  profile?: ProfileBase | null;
};

const createMockEnrollmentsService = (): jest.Mocked<EnrollmentsService> =>
  ({
    getEnrollments: jest.fn(),
    getEnrollmentsByLectureId: jest.fn(),
    getEnrollmentDetail: jest.fn(),
    getEnrollmentDetailByLectureEnrollmentId: jest.fn(),
    updateEnrollment: jest.fn(),
    getMyEnrollments: jest.fn(),
    getEnrollmentLectures: jest.fn(),
    getEnrollmentById: jest.fn(),
    createEnrollment: jest.fn(),
    createEnrollmentMigration: jest.fn(),
    removeLectureEnrollment: jest.fn(),
  }) as unknown as jest.Mocked<EnrollmentsService>;

describe('EnrollmentsController - @unit', () => {
  let mockEnrollmentsService: jest.Mocked<EnrollmentsService>;
  let controller: EnrollmentsController;
  let mockReq: MockRequest;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockEnrollmentsService = createMockEnrollmentsService();
    controller = new EnrollmentsController(mockEnrollmentsService);

    mockReq = {
      body: {},
      query: {},
      params: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('getEnrollments', () => {
    it('강사 목록 조회 응답의 enrollment 날짜를 KST로 변환한다', async () => {
      const registeredAt = new Date('2024-03-01T00:00:00.000Z');
      const createdAt = new Date('2024-03-02T00:00:00.000Z');
      const updatedAt = new Date('2024-03-03T00:00:00.000Z');

      mockReq.user = {
        id: 'user-1',
        email: 'instructor@test.com',
        userType: UserType.INSTRUCTOR,
        name: '강사',
      };
      mockReq.profile = mockInstructor;
      mockReq.query = { page: '1', limit: '10' };

      const mockEnrollmentListItem: EnrollmentListItem = {
        ...mockEnrollments.active,
        appStudent: mockStudents.basic,
        registeredAt,
        createdAt,
        updatedAt,
        attendance: null,
        lecture: null,
      };

      mockEnrollmentsService.getEnrollments.mockResolvedValue({
        enrollments: [mockEnrollmentListItem],
        totalCount: 1,
      });

      await controller.getEnrollments(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            list: [
              expect.objectContaining({
                registeredAt: toKstIsoString(registeredAt),
                createdAt: toKstIsoString(createdAt),
                updatedAt: toKstIsoString(updatedAt),
              }),
            ],
          }),
        }),
      );
    });
  });

  describe('getEnrollment', () => {
    it('상세 조회 응답의 enrollment 및 lectures 날짜를 KST로 변환한다', async () => {
      const enrollmentRegisteredAt = new Date('2024-04-01T00:00:00.000Z');
      const enrollmentCreatedAt = new Date('2024-04-02T00:00:00.000Z');
      const enrollmentUpdatedAt = new Date('2024-04-03T00:00:00.000Z');
      const lectureRegisteredAt = new Date('2024-04-04T00:00:00.000Z');
      const lectureCreatedAt = new Date('2024-04-05T00:00:00.000Z');
      const lectureUpdatedAt = new Date('2024-04-06T00:00:00.000Z');

      mockReq.user = {
        id: 'user-1',
        email: 'instructor@test.com',
        userType: UserType.INSTRUCTOR,
        name: '강사',
      };
      mockReq.profile = mockInstructor;
      mockReq.params = { enrollmentId: mockEnrollments.active.id };

      const mockLecture: EnrollmentDetailLecture = {
        ...mockLectures.basic,
        lectureEnrollmentId: 'le-1',
        registeredAt: lectureRegisteredAt,
        createdAt: lectureCreatedAt,
        updatedAt: lectureUpdatedAt,
      };

      const mockEnrollmentDetail: EnrollmentDetailResult = {
        ...mockEnrollments.active,
        registeredAt: enrollmentRegisteredAt,
        createdAt: enrollmentCreatedAt,
        updatedAt: enrollmentUpdatedAt,
        instructor: undefined,
        lectureEnrollments: undefined,
        instructorName: '강사명',
        instructorPhoneNumber: mockInstructor.phoneNumber,
        lectures: [mockLecture],
      };

      mockEnrollmentsService.getEnrollmentDetail.mockResolvedValue(
        mockEnrollmentDetail,
      );

      await controller.getEnrollment(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            enrollment: expect.objectContaining({
              registeredAt: toKstIsoString(enrollmentRegisteredAt),
              createdAt: toKstIsoString(enrollmentCreatedAt),
              updatedAt: toKstIsoString(enrollmentUpdatedAt),
              lectures: [
                expect.objectContaining({
                  registeredAt: toKstIsoString(lectureRegisteredAt),
                  createdAt: toKstIsoString(lectureCreatedAt),
                  updatedAt: toKstIsoString(lectureUpdatedAt),
                }),
              ],
            }),
          },
        }),
      );
    });

    it('학생 상세 조회 응답의 nested enrollment 날짜를 KST로 변환한다', async () => {
      const registeredAt = new Date('2024-05-01T00:00:00.000Z');
      const createdAt = new Date('2024-05-02T00:00:00.000Z');
      const updatedAt = new Date('2024-05-03T00:00:00.000Z');

      mockReq.user = {
        id: 'user-2',
        email: 'student@test.com',
        userType: UserType.STUDENT,
        name: '학생',
      };
      mockReq.profile = mockStudents.basic;
      mockReq.params = { lectureEnrollmentId: 'le-1' };

      const mockEnrollmentById: EnrollmentByIdResult = {
        id: 'le-1',
        memo: null,
        lectureId: mockLectures.basic.id,
        enrollmentId: mockEnrollments.active.id,
        registeredAt,
        lecture: {
          ...mockLectures.basic,
        },
        enrollment: {
          ...mockEnrollments.active,
          registeredAt,
          createdAt,
          updatedAt,
        },
        grades: [],
        attendances: [],
      };

      mockEnrollmentsService.getEnrollmentById.mockResolvedValue(
        mockEnrollmentById,
      );

      await controller.getEnrollment(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            enrollment: expect.objectContaining({
              registeredAt: toKstIsoString(registeredAt),
              enrollment: expect.objectContaining({
                registeredAt: toKstIsoString(registeredAt),
                createdAt: toKstIsoString(createdAt),
                updatedAt: toKstIsoString(updatedAt),
              }),
            }),
          },
        }),
      );
    });
  });

  describe('getEnrollmentLectures', () => {
    it('강의 목록 조회 응답의 lectureEnrollment 및 lecture 날짜를 KST로 변환한다', async () => {
      const registeredAt = new Date('2024-06-01T00:00:00.000Z');
      const createdAt = new Date('2024-06-02T00:00:00.000Z');
      const updatedAt = new Date('2024-06-03T00:00:00.000Z');

      mockReq.user = {
        id: 'user-2',
        email: 'student@test.com',
        userType: UserType.STUDENT,
        name: '학생',
      };
      mockReq.profile = mockStudents.basic;
      mockReq.params = { enrollmentId: mockEnrollments.active.id };

      const mockLectureEnrollment: LectureEnrollmentListItem = {
        id: 'le-1',
        lectureId: mockLectures.basic.id,
        enrollmentId: mockEnrollments.active.id,
        registeredAt,
        lecture: {
          ...mockLectures.basic,
          createdAt,
          updatedAt,
        },
      };

      mockEnrollmentsService.getEnrollmentLectures.mockResolvedValue({
        lectureEnrollments: [mockLectureEnrollment],
      });

      await controller.getEnrollmentLectures(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            lectureEnrollments: [
              expect.objectContaining({
                registeredAt: toKstIsoString(registeredAt),
                lecture: expect.objectContaining({
                  createdAt: toKstIsoString(createdAt),
                  updatedAt: toKstIsoString(updatedAt),
                }),
              }),
            ],
          },
        }),
      );
    });
  });
});
