import { StudentPostsService } from './student-posts.service.js';
import {
  createMockStudentPostsRepository,
  createMockEnrollmentsRepository,
  createMockLectureEnrollmentsRepository,
  createMockLecturesRepository,
  // createMockInstructorPostsRepository,
} from '../test/mocks/repo.mock.js';
// import { createMockPrisma } from '../test/mocks/prisma.mock.js';

describe('StudentPostsService', () => {
  let service: StudentPostsService;
  let studentPostsRepo: ReturnType<typeof createMockStudentPostsRepository>;
  let enrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let lectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let lecturesRepo: ReturnType<typeof createMockLecturesRepository>;

  // User requested additional mocks
  // let instructorPostsRepo: ReturnType<
  //     typeof createMockInstructorPostsRepository
  // >;
  // let prismaService: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    // Initialize Auto-mocks
    studentPostsRepo = createMockStudentPostsRepository();
    enrollmentsRepo = createMockEnrollmentsRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    lecturesRepo = createMockLecturesRepository();

    // Initialize additional mocks requested by user
    // instructorPostsRepo = createMockInstructorPostsRepository();
    // prismaService = createMockPrisma();

    service = new StudentPostsService(
      studentPostsRepo,
      enrollmentsRepo,
      lectureEnrollmentsRepo,
      lecturesRepo,
    );
  });

  describe('createPost', () => {
    it('should be defined', () => {
      expect(service.createPost).toBeDefined();
    });
  });

  describe('getPostList', () => {
    it('should be defined', () => {
      expect(service.getPostList).toBeDefined();
    });
  });

  describe('getPostDetail', () => {
    it('should be defined', () => {
      expect(service.getPostDetail).toBeDefined();
    });
  });

  describe('updateStatus', () => {
    it('should be defined', () => {
      expect(service.updateStatus).toBeDefined();
    });
  });
});
