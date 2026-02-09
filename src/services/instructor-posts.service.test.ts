import { InstructorPostsService } from './instructor-posts.service.js';
import {
  createMockInstructorPostsRepository,
  createMockLecturesRepository,
  createMockMaterialsRepository,
  // createMockInstructorRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
// import { createMockPrisma } from '../test/mocks/prisma.mock.js';
import { UserType } from '../constants/auth.constant.js';
import { ForbiddenException } from '../err/http.exception.js';
import { mockInstructorPosts } from '../test/fixtures/posts.fixture.js';

describe('InstructorPostsService', () => {
  let service: InstructorPostsService;
  let instructorPostsRepo: ReturnType<
    typeof createMockInstructorPostsRepository
  >;
  let lecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let materialsRepo: ReturnType<typeof createMockMaterialsRepository>;
  let permissionService: ReturnType<typeof createMockPermissionService>;

  // User requested additional mocks
  // let instructorRepo: ReturnType<typeof createMockInstructorRepository>;
  // let prismaService: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    // Initialize Auto-mocks
    instructorPostsRepo = createMockInstructorPostsRepository();
    lecturesRepo = createMockLecturesRepository();
    materialsRepo = createMockMaterialsRepository();
    permissionService = createMockPermissionService();

    // Initialize additional mocks requested by user
    // instructorRepo = createMockInstructorRepository();
    // prismaService = createMockPrisma();

    service = new InstructorPostsService(
      instructorPostsRepo,
      lecturesRepo,
      materialsRepo,
      permissionService,
    );
  });

  describe('createPost', () => {
    it('강사 또는 조교가 아닌 사용자가 호출하면 ForbiddenException이 발생한다', async () => {
      // TODO: 권한 검증 (강사/조교만 가능)
    });

    it('조교가 호출할 때 담당 강사 정보를 찾을 수 없으면 ForbiddenException이 발생한다', async () => {
      // TODO: permissionService.getInstructorIdByAssistantId 가 null 반환 시
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: lecturesRepository.findById 가 null 반환 시
    });

    it('강의 공지(LECTURE) 생성 시 해당 강의의 담당 강사가 아니면 ForbiddenException이 발생한다', async () => {
      // TODO: lecture.instructorId !== instructorId
    });

    it('강의 공지(LECTURE) 생성 시 lectureId가 누락되면 BadRequestException이 발생한다', async () => {
      // TODO: data.scope === LECTURE && !data.lectureId
    });

    it('선택 공지(SELECTED) 생성 시 타겟 학생이 지정되지 않으면 BadRequestException이 발생한다', async () => {
      // TODO: SELECTED 스코프인데 targetEnrollmentIds 가 비어있을 때
    });

    describe('자료 소유권 검증 (validateMaterialOwnership)', () => {
      it('첨부하려는 자료 중 일부가 존재하지 않으면 NotFoundException이 발생한다', async () => {
        // TODO: materialsRepository.findByIds 결과 개수 불일치
      });

      it('다른 강사의 라이브러리 자료를 첨부하려고 하면 ForbiddenException이 발생한다', async () => {
        // TODO: material.instructorId !== instructorId
      });
    });

    it('모든 유효성 검사를 통과하면 게시글을 생성하고 상세 정보를 반환한다', async () => {
      // TODO: instructorPostsRepository.create 호출 및 반환
    });
  });

  describe('getPostList', () => {
    it('강사가 조회하면 본인의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      // TODO: userType === INSTRUCTOR 인 경우
    });

    it('조교가 조회하면 담당 강사의 ID를 기준으로 필터링하여 목록을 반환한다', async () => {
      // TODO: userType === ASSISTANT 인 경우
    });

    describe('학생 조회 권한', () => {
      it('학생이 특정 강의의 공지를 조회할 때, 수강 권한이 없으면 ForbiddenException이 발생한다', async () => {
        // TODO: permissionService.validateLectureReadAccess 실패 시
      });

      it('학생이 존재하지 않는 강의의 공지를 조회하려고 하면 NotFoundException이 발생한다', async () => {
        // TODO: lecturesRepository.findById 가 null 반환 시
      });
    });

    it('검색어, 페이지네이션 필터가 포함된 경우 정상적으로 목록을 반환한다', async () => {
      // TODO: instructorPostsRepository.findMany 호출
    });
  });

  describe('getPostDetail', () => {
    it('postId에 해당하는 게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: instructorPostsRepository.findById 가 null 반환 시
    });

    it('강사가 본인의 것이 아닌 게시글을 상세 조회하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== profileId
    });

    it('조교가 담당 강사의 것이 아닌 게시글을 상세 조회하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== assistant.instructorId
    });

    describe('수강생 접근 권한', () => {
      it('전체(GLOBAL) 공지는 해당 강사의 강의를 하나라도 수강 중인 학생에게 상세 정보를 반환한다', async () => {
        const post = mockInstructorPosts.global;
        instructorPostsRepo.findById.mockResolvedValue(post);
        permissionService.validateInstructorStudentLink.mockResolvedValue(
          undefined,
        );

        const result = await service.getPostDetail(
          post.id,
          UserType.STUDENT,
          'student-1',
        );

        expect(result).toEqual(post);
        expect(
          permissionService.validateInstructorStudentLink,
        ).toHaveBeenCalledWith(post.instructorId, 'student-1');
      });

      it('전체(GLOBAL) 공지 조회 시, 해당 강사의 강의를 하나도 수강하지 않는 학생이라면 ForbiddenException이 발생한다', async () => {
        const post = mockInstructorPosts.global;
        instructorPostsRepo.findById.mockResolvedValue(post);
        permissionService.validateInstructorStudentLink.mockRejectedValue(
          new ForbiddenException('해당 강사의 수강생이 아닙니다.'),
        );

        await expect(
          service.getPostDetail(post.id, UserType.STUDENT, 'student-1'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('강의(LECTURE) 공지는 수강 학생인 경우 상세 정보를 반환한다', async () => {
        // TODO: 수강 권한 검증 통과 시
      });

      it('강의(LECTURE) 공지 조회 시 수강생이 아니면 ForbiddenException이 발생한다', async () => {
        // TODO: permissionService.validateLectureReadAccess 실패 시
      });

      it('선택(SELECTED) 공지는 타겟 명단에 포함된 학생에게 상세 정보를 반환한다', async () => {
        // TODO: post.targets 에 포함된 학생일 때
      });

      it('선택(SELECTED) 공지 조회 시 타겟 명단에 없으면 ForbiddenException이 발생한다', async () => {
        // TODO: post.targets 에 포함되지 않은 학생일 때
      });
    });
  });

  describe('updatePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: instructorPostsRepository.findById 가 null 반환 시
    });

    it('강사가 본인의 게시글이 아닌 것을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== profileId
    });

    it('조교가 본인이 작성하지 않은 게시글을 수정하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.authorAssistantId !== profileId
    });

    it('유효한 권한으로 수정 요청 시 제목, 내용, 자료 등을 업데이트하고 결과를 반환한다', async () => {
      // TODO: instructorPostsRepository.update 호출
    });
  });

  describe('deletePost', () => {
    it('게시글이 존재하지 않으면 NotFoundException이 발생한다', async () => {
      // TODO: instructorPostsRepository.findById 가 null 반환 시
    });

    it('강사가 본인의 게시글이 아닌 것을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.instructorId !== profileId
    });

    it('조교가 본인이 작성하지 않은 게시글을 삭제하려고 하면 ForbiddenException이 발생한다', async () => {
      // TODO: post.authorAssistantId !== profileId
    });

    it('유효한 권한으로 삭제 요청 시 게시글이 성공적으로 삭제된다', async () => {
      // TODO: instructorPostsRepository.delete 호출
    });
  });
});
