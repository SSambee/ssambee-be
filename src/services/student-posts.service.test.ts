import { StudentPostsService } from './student-posts.service.js';
import {
    createMockStudentPostsRepository,
    createMockEnrollmentsRepository,
    createMockLectureEnrollmentsRepository,
    createMockLecturesRepository,
    // createMockInstructorPostsRepository,
} from '../test/mocks/repo.mock.js';
import { UserType } from '../constants/auth.constant.js';
import { BadRequestException, NotFoundException, ForbiddenException } from '../err/http.exception.js';
import { mockStudentPosts } from '../test/fixtures/posts.fixture.js';
import { mockInstructor, mockLectures } from '../test/fixtures/lectures.fixture.js';
import { AuthorRole, StudentPostStatus } from '../constants/posts.constant.js';

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
        describe('학생(STUDENT) 권한', () => {
            it('강의 ID(lectureId)가 누락되면 BadRequestException을 던져야 한다', async () => {
                const data = { title: '제목', content: '내용' } as any;
                await expect(service.createPost(data, UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(BadRequestException);
            });

            it('존재하지 않는 강의 ID인 경우 NotFoundException을 던져야 한다', async () => {
                const data = { title: '제목', content: '내용', lectureId: 'invalid-lecture' };
                lecturesRepo.findById.mockResolvedValue(null);

                await expect(service.createPost(data, UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(NotFoundException);
            });

            it('해당 강의를 수강하고 있지 않은 학생인 경우 ForbiddenException을 던져야 한다', async () => {
                const data = { title: '제목', content: '내용', lectureId: 'lecture-1' };
                lecturesRepo.findById.mockResolvedValue({ id: 'lecture-1' } as any);
                lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(null);

                await expect(service.createPost(data, UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(ForbiddenException);
            });

            it('수강 정보(enrollment)를 찾을 수 없는 경우 NotFoundException을 던져야 한다', async () => {
                const data = { title: '제목', content: '내용', lectureId: 'lecture-1' };
                const mockLectureEnrollment = { enrollmentId: 'enrollment-1' };
                lecturesRepo.findById.mockResolvedValue({ id: 'lecture-1' } as any);
                lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(mockLectureEnrollment as any);
                enrollmentsRepo.findById.mockResolvedValue(null);

                await expect(service.createPost(data, UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(NotFoundException);
            });

            it('모든 조건이 충족되면 성공적으로 질문을 생성하고 반환해야 한다', async () => {
                const data = { title: '제목', content: '내용', lectureId: 'lecture-1' };
                const mockEnrollment = { id: 'enrollment-1', instructorId: 'instructor-1' };
                const mockLectureEnrollment = { enrollmentId: 'enrollment-1' };
                const mockCreatedPost = mockStudentPosts.basic;

                lecturesRepo.findById.mockResolvedValue({ id: 'lecture-1' } as any);
                lectureEnrollmentsRepo.findByLectureIdAndStudentId.mockResolvedValue(mockLectureEnrollment as any);
                enrollmentsRepo.findById.mockResolvedValue(mockEnrollment as any);
                studentPostsRepo.create.mockResolvedValue(mockCreatedPost as any);

                const result = await service.createPost(data, UserType.STUDENT, 'student-1');

                expect(result).toEqual(mockCreatedPost);
                expect(studentPostsRepo.create).toHaveBeenCalledWith({
                    title: data.title,
                    content: data.content,
                    status: StudentPostStatus.PENDING,
                    enrollmentId: mockEnrollment.id,
                    authorRole: AuthorRole.STUDENT,
                    instructorId: mockEnrollment.instructorId,
                    lectureId: data.lectureId,
                });
            });
        });

        describe('학부모(PARENT) 권한', () => {
            it('현재 학부모 질문 작성은 지원되지 않으므로 BadRequestException을 던져야 한다', async () => {
                // TODO: userType === PARENT
            });
        });

        describe('기타 권한', () => {
            it('강사나 관리자 등 질문 작성 권한이 없는 사용자는 ForbiddenException을 던져야 한다', async () => {
                // TODO: userType is not STUDENT or PARENT
            });
        });
    });

    describe('getPostList', () => {
        it('강사가 조회하는 경우 본인(instructorId)의 질문 목록을 반환해야 한다', async () => {
            const query = { page: 1, limit: 10 };
            const profileId = 'instructor-1';
            const mockResponse = { posts: [mockStudentPosts.basic], totalCount: 1 };
            studentPostsRepo.findMany.mockResolvedValue(mockResponse as any);

            const result = await service.getPostList(query, UserType.INSTRUCTOR, profileId);

            expect(result).toEqual(mockResponse);
            expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
                ...query,
                instructorId: profileId,
                appStudentId: undefined,
            });
        });

        it('학생이 조회하는 경우 본인(appStudentId)의 질문 목록을 반환해야 한다', async () => {
            const query = { page: 1, limit: 10 };
            const profileId = 'student-1';
            const mockResponse = { posts: [mockStudentPosts.basic], totalCount: 1 };
            studentPostsRepo.findMany.mockResolvedValue(mockResponse as any);

            const result = await service.getPostList(query, UserType.STUDENT, profileId);

            expect(result).toEqual(mockResponse);
            expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
                ...query,
                instructorId: undefined,
                appStudentId: profileId,
            });
        });

        it('검색어, 상태 필터링 및 페이지네이션이 정상적으로 적용되어야 한다', async () => {
            const query = { page: 2, limit: 5, search: '검색', status: 'PENDING' };
            const mockResponse = { posts: [], totalCount: 0 };
            studentPostsRepo.findMany.mockResolvedValue(mockResponse as any);

            await service.getPostList(query, UserType.INSTRUCTOR, 'instructor-1');

            expect(studentPostsRepo.findMany).toHaveBeenCalledWith({
                ...query,
                instructorId: 'instructor-1',
                appStudentId: undefined,
            });
        });
    });

    describe('getPostDetail', () => {
        it('존재하지 않는 질문 ID인 경우 NotFoundException을 던져야 한다', async () => {
            studentPostsRepo.findById.mockResolvedValue(null);
            await expect(service.getPostDetail('invalid-id', UserType.STUDENT, 'student-1'))
                .rejects.toThrow(NotFoundException);
        });

        describe('권한 검증', () => {
            it('학생이 본인의 질문이 아닌 것을 상세 조회하려고 하면 ForbiddenException을 던져야 한다', async () => {
                const post = mockStudentPosts.basic;
                studentPostsRepo.findById.mockResolvedValue(post as any);
                enrollmentsRepo.findById.mockResolvedValue({ appStudentId: 'other-student' } as any);

                await expect(service.getPostDetail(post.id, UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(ForbiddenException);
            });

            it('학생이 본인의 질문을 상세 조회하는 경우 정보를 반환해야 한다', async () => {
                const post = mockStudentPosts.basic;
                studentPostsRepo.findById.mockResolvedValue(post as any);
                enrollmentsRepo.findById.mockResolvedValue({ appStudentId: 'student-1' } as any);

                const result = await service.getPostDetail(post.id, UserType.STUDENT, 'student-1');

                expect(result).toEqual(post);
            });

            it('강사가 본인이 담당하지 않는 학생의 질문을 조회하려고 하면 ForbiddenException을 던져야 한다', async () => {
                const post = { ...mockStudentPosts.basic, instructorId: 'other-instructor' };
                studentPostsRepo.findById.mockResolvedValue(post as any);

                await expect(service.getPostDetail(post.id, UserType.INSTRUCTOR, 'instructor-1'))
                    .rejects.toThrow(ForbiddenException);
            });

            it('강사가 담당 학생의 질문을 상세 조회하는 경우 정보를 반환해야 한다', async () => {
                const post = { ...mockStudentPosts.basic, instructorId: 'instructor-1' };
                studentPostsRepo.findById.mockResolvedValue(post as any);

                const result = await service.getPostDetail(post.id, UserType.INSTRUCTOR, 'instructor-1');

                expect(result).toEqual(post);
            });
        });
    });

    describe('updateStatus', () => {
        it('존재하지 않는 질문 ID인 경우 NotFoundException을 던져야 한다', async () => {
            studentPostsRepo.findById.mockResolvedValue(null);
            await expect(service.updateStatus('invalid-id', 'RESOLVED', UserType.INSTRUCTOR, 'instructor-1'))
                .rejects.toThrow(NotFoundException);
        });

        describe('권한 검증', () => {
            it('강사가 본인이 담당하지 않는 학생의 질문 상태를 변경하려고 하면 ForbiddenException을 던져야 한다', async () => {
                const post = { ...mockStudentPosts.basic, instructorId: 'other-instructor' };
                studentPostsRepo.findById.mockResolvedValue(post as any);

                await expect(service.updateStatus(post.id, 'RESOLVED', UserType.INSTRUCTOR, 'instructor-1'))
                    .rejects.toThrow(ForbiddenException);
            });

            it('학생이 본인의 질문이 아닌 것의 상태를 변경하려고 하면 ForbiddenException을 던져야 한다', async () => {
                const post = mockStudentPosts.basic;
                studentPostsRepo.findById.mockResolvedValue(post as any);
                enrollmentsRepo.findById.mockResolvedValue({ appStudentId: 'other-student' } as any);

                await expect(service.updateStatus(post.id, 'RESOLVED', UserType.STUDENT, 'student-1'))
                    .rejects.toThrow(ForbiddenException);
            });

            it('권한이 있는 사용자가 상태를 변경하면 성공적으로 업데이트하고 질문 정보를 반환해야 한다', async () => {
                const post = mockStudentPosts.basic;
                studentPostsRepo.findById.mockResolvedValue(post as any);
                enrollmentsRepo.findById.mockResolvedValue({ appStudentId: 'student-1' } as any);
                studentPostsRepo.updateStatus.mockResolvedValue({ ...post, status: 'RESOLVED' } as any);

                const result = await service.updateStatus(post.id, 'RESOLVED', UserType.STUDENT, 'student-1');

                expect(result.status).toBe('RESOLVED');
                expect(studentPostsRepo.updateStatus).toHaveBeenCalledWith(post.id, 'RESOLVED');
            });
        });
    });
});
