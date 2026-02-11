import { MaterialsService } from '../../src/services/materials.service.js';
import { FileStorageService } from '../../src/services/filestorage.service.js';
import {
  MaterialType,
  FrontendMaterialType,
} from '../../src/constants/materials.constant.js';
import { UserType } from '../../src/constants/auth.constant.js';
import {
  BadRequestException,
  ForbiddenException,
} from '../../src/err/http.exception.js';
import {
  createMockMaterialsRepository,
  createMockLecturesRepository,
  createMockLectureEnrollmentsRepository,
  createMockInstructorRepository,
  createMockAssistantRepository,
} from '../test/mocks/repo.mock.js';
import { createMockPermissionService } from '../test/mocks/services.mock.js';
import {
  mockLectures,
  mockMaterials,
  mockInstructor,
  mockProfiles,
  mockEnrollments,
} from '../test/fixtures/index.js';
import {
  UploadMaterialDto,
  GetMaterialsQueryDto,
} from '../../src/validations/materials.validation.js';

describe('MaterialsService', () => {
  let service: MaterialsService;
  let materialsRepo: ReturnType<typeof createMockMaterialsRepository>;
  let lecturesRepo: ReturnType<typeof createMockLecturesRepository>;
  let lectureEnrollmentsRepo: ReturnType<
    typeof createMockLectureEnrollmentsRepository
  >;
  let adminRepo: ReturnType<typeof createMockInstructorRepository>;
  let assistantRepo: ReturnType<typeof createMockAssistantRepository>;
  let fileStorageService: jest.Mocked<FileStorageService>;
  let permissionService: ReturnType<typeof createMockPermissionService>;

  beforeEach(() => {
    materialsRepo = createMockMaterialsRepository();
    lecturesRepo = createMockLecturesRepository();
    lectureEnrollmentsRepo = createMockLectureEnrollmentsRepository();
    adminRepo = createMockInstructorRepository();
    assistantRepo = createMockAssistantRepository();

    fileStorageService = {
      upload: jest.fn(),
      getPresignedUrl: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<FileStorageService>;

    permissionService = createMockPermissionService();
    assistantRepo.findAllByInstructorId.mockResolvedValue([]);

    service = new MaterialsService(
      materialsRepo,
      lecturesRepo,
      lectureEnrollmentsRepo,
      adminRepo,
      assistantRepo,
      fileStorageService,
      permissionService,
    );
  });

  describe('uploadMaterial', () => {
    it('유효한 YouTube 링크를 업로드하면 성공해야 한다', async () => {
      // Arrange
      const dto: UploadMaterialDto = {
        title: 'Video',
        type: FrontendMaterialType.VIDEO,
        youtubeUrl: 'https://youtube.com/watch?v=123',
      };
      const mockLecture = mockLectures.basic;
      const mockMaterial = mockMaterials.video;

      lecturesRepo.findById.mockResolvedValue(mockLecture);
      materialsRepo.create.mockResolvedValue(mockMaterial);
      adminRepo.findById.mockResolvedValue({
        ...mockInstructor,
        user: { name: '이강사' },
      });

      // Act
      await service.uploadMaterial(
        mockLecture.id,
        dto,
        undefined,
        UserType.INSTRUCTOR,
        mockLecture.instructorId,
      );

      // Assert
      expect(permissionService.validateInstructorAccess).toHaveBeenCalled();
      expect(materialsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MaterialType.VIDEO_LINK,
          fileUrl: dto.youtubeUrl,
          authorName: '이강사',
          authorRole: UserType.INSTRUCTOR,
          instructorId: mockInstructor.id,
        }),
      );
    });

    it('잘못된 YouTube 링크인 경우 에러를 던져야 한다', async () => {
      const dto: UploadMaterialDto = {
        title: 'Video',
        type: FrontendMaterialType.VIDEO,
        youtubeUrl: 'https://invalid-url.com',
      };

      lecturesRepo.findById.mockResolvedValue(mockLectures.basic);

      await expect(
        service.uploadMaterial(
          mockLectures.basic.id,
          dto,
          undefined,
          UserType.INSTRUCTOR,
          mockInstructor.id,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('파일 업로드 시 S3 업로드를 호출해야 한다', async () => {
      const dto: UploadMaterialDto = {
        title: 'File',
        type: FrontendMaterialType.PAPER,
      };
      const s3Url = 'https://s3.aws.com/test.pdf';
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('test-buffer'),
        mimetype: 'application/pdf',
      } as unknown as Express.Multer.File;

      fileStorageService.upload.mockResolvedValue(s3Url);

      lecturesRepo.findById.mockResolvedValue(mockLectures.basic);
      adminRepo.findById.mockResolvedValue({
        ...mockInstructor,
        user: { name: '이강사' },
      });
      materialsRepo.create.mockResolvedValue(mockMaterials.basic);

      await service.uploadMaterial(
        mockLectures.basic.id,
        dto,
        mockFile,
        UserType.INSTRUCTOR,
        mockInstructor.id,
      );

      expect(fileStorageService.upload).toHaveBeenCalledWith(
        mockFile,
        expect.stringMatching(/^paper\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/),
      );

      expect(materialsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fileUrl: s3Url,
          authorName: '이강사',
        }),
      );
    });

    it('강의 ID 없이 업로드하면(라이브러리) 성공해야 한다', async () => {
      const dto: UploadMaterialDto = {
        title: 'Lib',
        type: FrontendMaterialType.PAPER,
      };
      const mockFile = {
        originalname: 'lib.pdf',
        buffer: Buffer.from('lib-buffer'),
        mimetype: 'application/pdf',
      } as unknown as Express.Multer.File;

      fileStorageService.upload.mockResolvedValue('https://s3.aws.com/lib.pdf');
      adminRepo.findById.mockResolvedValue({
        ...mockInstructor,
        user: { name: '이강사' },
      });
      materialsRepo.create.mockResolvedValue({
        ...mockMaterials.basic,
        lectureId: null,
      });

      await service.uploadMaterial(
        undefined,
        dto,
        mockFile,
        UserType.INSTRUCTOR,
        mockInstructor.id,
      );

      expect(lecturesRepo.findById).not.toHaveBeenCalled();

      expect(fileStorageService.upload).toHaveBeenCalledWith(
        mockFile,
        expect.stringMatching(/^paper\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/),
      );

      expect(materialsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lectureId: null,
          title: dto.title,
        }),
      );
    });
  });

  describe('getMaterials', () => {
    it('강의 자료 목록을 조회해야 한다', async () => {
      const query: GetMaterialsQueryDto & { lectureId: string } = {
        page: 1,
        limit: 10,
        lectureId: mockLectures.basic.id,
      };
      lecturesRepo.findById.mockResolvedValue(mockLectures.basic);

      materialsRepo.findMany.mockResolvedValue({
        materials: [mockMaterials.basic],
        totalCount: 1,
      });

      const result = await service.getMaterials(
        query,
        UserType.INSTRUCTOR,
        mockInstructor.id,
      );

      expect(result.materials).toHaveLength(1);
      expect(result.pagination.totalCount).toBe(1);
      expect(result.materials[0].file?.url).toContain('/api/mgmt/v1/materials');
      expect(result.materials[0]).toHaveProperty('writer');
      expect(result.materials[0].writer).toBe('이강사'); // Instructor is not masked
      expect(result.materials[0]).toHaveProperty('date');
      expect(result.materials[0]).toHaveProperty('className');
    });

    it('활성 조교인 경우 이름을 마스킹하지 않아야 한다', async () => {
      const query: GetMaterialsQueryDto & { lectureId: string } = {
        page: 1,
        limit: 10,
        lectureId: mockLectures.basic.id,
      };
      lecturesRepo.findById.mockResolvedValue(mockLectures.basic);

      const assistantName = '김조교';
      materialsRepo.findMany.mockResolvedValue({
        materials: [
          {
            ...mockMaterials.basic,
            authorName: assistantName,
            authorRole: UserType.ASSISTANT,
          },
        ],
        totalCount: 1,
      });

      assistantRepo.findAllByInstructorId.mockResolvedValue([
        { ...mockProfiles.assistant, user: { name: assistantName } },
      ]);

      const result = await service.getMaterials(
        query,
        UserType.INSTRUCTOR,
        mockInstructor.id,
      );

      expect(result.materials[0].writer).toBe(assistantName);
    });

    it('라이브러리 자료 조회 시 현재 강사의 ID로 필터링해야 한다', async () => {
      const query: GetMaterialsQueryDto = { page: 1, limit: 10 };
      const instructorId = 'instructor-1';

      permissionService.getEffectiveInstructorId.mockResolvedValue(
        instructorId,
      );
      materialsRepo.findMany.mockResolvedValue({
        materials: [],
        totalCount: 0,
      });

      await service.getMaterials(query, UserType.INSTRUCTOR, instructorId);

      expect(permissionService.getEffectiveInstructorId).toHaveBeenCalledWith(
        UserType.INSTRUCTOR,
        instructorId,
      );
      expect(materialsRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          instructorId,
        }),
      );
    });
  });

  describe('deleteMaterial', () => {
    it('자료 삭제 시 S3 파일도 함께 삭제되어야 한다 (링크 제외)', async () => {
      const mockMaterial = mockMaterials.exam;
      const mockLecture = mockLectures.basic;

      materialsRepo.findById.mockResolvedValue(mockMaterial);
      lecturesRepo.findById.mockResolvedValue(mockLecture);

      await service.deleteMaterial(
        mockMaterial.id,
        UserType.INSTRUCTOR,
        mockLecture.instructorId,
      );

      expect(materialsRepo.softDelete).toHaveBeenCalledWith(mockMaterial.id);
    });

    it('YouTube 링크인 경우 S3 삭제는 호출되지 않아야 한다', async () => {
      const mockMaterial = mockMaterials.video;
      const mockLecture = mockLectures.basic;

      materialsRepo.findById.mockResolvedValue(mockMaterial);
      lecturesRepo.findById.mockResolvedValue(mockLecture);

      await service.deleteMaterial(
        mockMaterial.id,
        UserType.INSTRUCTOR,
        mockLecture.instructorId,
      );

      expect(fileStorageService.delete).not.toHaveBeenCalledWith(
        mockMaterial.fileUrl,
      );
      expect(materialsRepo.softDelete).toHaveBeenCalledWith(mockMaterial.id);
    });
  });

  describe('getMaterialDetail', () => {
    it('자료 상세 정보를 반환해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        authorName: '이강사',
        lecture: { title: '강의' },
      };
      const mockLecture = mockLectures.basic;

      materialsRepo.findById.mockResolvedValue(mockMaterial);
      lecturesRepo.findById.mockResolvedValue(mockLecture);

      const result = await service.getMaterialDetail(
        mockMaterial.id,
        UserType.INSTRUCTOR,
        mockLecture.instructorId,
      );

      expect(result.title).toBe(mockMaterial.title);
      expect(result.writer).toBe('이강사');
      expect(result.file?.url).toContain('/api/mgmt/v1/materials');
    });

    it('학생이 수강하지 않는 강의의 자료를 조회하면 에러가 발생해야 한다', async () => {
      materialsRepo.findById.mockResolvedValue(mockMaterials.basic);
      lecturesRepo.findById.mockResolvedValue(mockLectures.basic);

      permissionService.validateLectureReadAccess.mockRejectedValue(
        new ForbiddenException(''),
      );

      await expect(
        service.getMaterialDetail(
          mockMaterials.basic.id,
          UserType.STUDENT,
          'other-student',
        ),
      ).rejects.toThrow();
    });

    it('다른 강사의 라이브러리 자료를 상세 조회하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);

      permissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        service.getMaterialDetail(
          mockMaterial.id,
          UserType.INSTRUCTOR,
          'instructor-b',
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(permissionService.validateInstructorAccess).toHaveBeenCalledWith(
        'instructor-a',
        UserType.INSTRUCTOR,
        'instructor-b',
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('다른 강사의 라이브러리 자료를 다운로드하려고 하면 ForbiddenException이 발생해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);

      permissionService.validateInstructorAccess.mockRejectedValue(
        new ForbiddenException('해당 권한이 없습니다.'),
      );

      await expect(
        service.getDownloadUrl(
          mockMaterial.id,
          UserType.INSTRUCTOR,
          'instructor-b',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('본인의 라이브러리 자료 다운로드 시 프레사인 URL을 반환해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        'instructor-a',
      );
      fileStorageService.getPresignedUrl.mockResolvedValue('presigned-url');

      const result = await service.getDownloadUrl(
        mockMaterial.id,
        UserType.INSTRUCTOR,
        'instructor-a',
      );

      expect(result.url).toBe('presigned-url');
    });

    it('조교가 담당 강사의 라이브러리 자료를 다운로드 시 성공해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);
      permissionService.getEffectiveInstructorId.mockResolvedValue(
        'instructor-a',
      );
      fileStorageService.getPresignedUrl.mockResolvedValue('presigned-url');

      const result = await service.getDownloadUrl(
        mockMaterial.id,
        UserType.ASSISTANT,
        'assistant-a',
      );

      expect(permissionService.validateInstructorAccess).toHaveBeenCalledWith(
        'instructor-a',
        UserType.ASSISTANT,
        'assistant-a',
      );
      expect(result.url).toBe('presigned-url');
    });

    it('학생이 게시글에 첨부된 라이브러리 자료를 다운로드 시 성공해야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      const mockEnrollment = {
        id: mockEnrollments.active.id,
        enrollmentId: mockEnrollments.active.id,
        lectureId: 'lecture-1',
        registeredAt: new Date(),
        memo: null,
        enrollment: mockEnrollments.active,
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);
      lectureEnrollmentsRepo.findFirstByInstructorIdAndStudentId.mockResolvedValue(
        mockEnrollment,
      );
      materialsRepo.isAccessibleByStudent.mockResolvedValue(true);
      fileStorageService.getPresignedUrl.mockResolvedValue('presigned-url');

      const result = await service.getDownloadUrl(
        mockMaterial.id,
        UserType.STUDENT,
        'student-1',
      );

      expect(materialsRepo.isAccessibleByStudent).toHaveBeenCalledWith(
        mockMaterial.id,
        mockEnrollments.active.id,
        undefined,
      );
      expect(result.url).toBe('presigned-url');
    });

    it('타인의 라이브러리 자료가 게시글에 첨부되지 않은 경우 학생의 다운로드는 차단되어야 한다', async () => {
      const mockMaterial = {
        ...mockMaterials.basic,
        lectureId: null,
        instructorId: 'instructor-a',
      };
      const mockEnrollment = {
        id: mockEnrollments.active.id,
        enrollmentId: mockEnrollments.active.id,
        lectureId: 'lecture-1',
        registeredAt: new Date(),
        memo: null,
        enrollment: mockEnrollments.active,
      };
      materialsRepo.findById.mockResolvedValue(mockMaterial);
      lectureEnrollmentsRepo.findFirstByInstructorIdAndStudentId.mockResolvedValue(
        mockEnrollment,
      );
      materialsRepo.isAccessibleByStudent.mockResolvedValue(false);

      await expect(
        service.getDownloadUrl(mockMaterial.id, UserType.STUDENT, 'student-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
