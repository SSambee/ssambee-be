import path from 'path';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import {
  MaterialType,
  toBackendMaterialType,
  toFrontendMaterialType,
  FrontendMaterialType,
} from '../constants/materials.constant.js';
import { UserType } from '../constants/auth.constant.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { InstructorRepository } from '../repos/instructor.repo.js';
import { AssistantRepository } from '../repos/assistant.repo.js';
import { PermissionService } from './permission.service.js';
import { FileStorageService } from './filestorage.service.js';
import {
  UploadMaterialDto,
  UpdateMaterialDto,
  GetMaterialsQueryDto,
} from '../validations/materials.validation.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

export class MaterialsService {
  constructor(
    private readonly materialsRepository: MaterialsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
    private readonly instructorRepository: InstructorRepository,
    private readonly assistantRepository: AssistantRepository,
    private readonly fileStorageService: FileStorageService,
    private readonly permissionService: PermissionService,
  ) {}

  /** 자료 업로드 */
  async uploadMaterial(
    lectureId: string | undefined,
    data: UploadMaterialDto,
    file: Express.Multer.File | undefined,
    userType: UserType,
    profileId: string,
  ) {
    let ownerInstructorId: string;

    if (lectureId) {
      const lecture = await this.lecturesRepository.findById(lectureId);
      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

      await this.permissionService.validateInstructorAccess(
        lecture.instructorId,
        userType,
        profileId,
      );

      // 강의 담당 강사 ID 설정
      ownerInstructorId = lecture.instructorId;
    } else {
      // 라이브러리 업로드인 경우 현재 사용자의 강사 ID 사용
      if (userType === UserType.INSTRUCTOR) {
        ownerInstructorId = profileId;
      } else if (userType === UserType.ASSISTANT) {
        const instructorId =
          await this.permissionService.getInstructorIdByAssistantId(profileId);
        if (!instructorId)
          throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
        ownerInstructorId = instructorId;
      } else {
        throw new ForbiddenException('자료 업로드 권한이 없습니다.');
      }
    }

    let fileUrl: string;

    const backendType = toBackendMaterialType[data.type];

    if (backendType === MaterialType.VIDEO_LINK) {
      if (!data.youtubeUrl) {
        throw new BadRequestException('동영상 링크가 필요합니다.');
      }
      fileUrl = this.validateYouTubeUrl(data.youtubeUrl);
    } else {
      if (!file) {
        throw new BadRequestException('파일 업로드가 필요합니다.');
      }

      const randomId = randomUUID();
      const ext = path.extname(file.originalname);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = data.type.toLowerCase();
      const key = `${prefix}/${year}/${month}/${randomId}${ext}`;

      fileUrl = await this.fileStorageService.upload(file, key);
    }

    let authorName: string;
    let authorRole: string;

    if (userType === UserType.INSTRUCTOR) {
      const instructor = await this.instructorRepository.findById(profileId);
      if (!instructor)
        throw new NotFoundException('강사 정보를 찾을 수 없습니다.');
      authorName = instructor.user.name;
      authorRole = UserType.INSTRUCTOR;
    } else if (userType === UserType.ASSISTANT) {
      const assistant = await this.assistantRepository.findById(profileId);
      if (!assistant)
        throw new NotFoundException('조교 정보를 찾을 수 없습니다.');
      authorName = assistant.user.name;
      authorRole = UserType.ASSISTANT;
    } else {
      throw new ForbiddenException('자료 업로드 권한이 없습니다.');
    }

    return this.materialsRepository.create({
      instructorId: ownerInstructorId,
      lectureId: lectureId || null,
      title: data.title,
      fileUrl,
      type: backendType,
      description: data.description,
      subject: data.subject,
      externalDownloadUrl: data.externalDownloadUrl,
      authorName,
      authorRole,
    });
  }

  /** 자료 목록 조회 */
  async getMaterials(
    query: GetMaterialsQueryDto & {
      lectureId?: string;
      type?: FrontendMaterialType;
    },
    userType: UserType,
    profileId: string,
  ) {
    const { lectureId } = query;

    // 강의가 지정된 경우 접근 권한 확인
    if (lectureId) {
      const lecture = await this.lecturesRepository.findById(lectureId);
      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

      await this.permissionService.validateLectureReadAccess(
        lectureId,
        { instructorId: lecture.instructorId },
        userType,
        profileId,
      );
    } else {
      // 강의 미지정(라이브러리): 학생/학부모는 접근 불가 (기획에 따라 변경 가능)
      if (userType === UserType.STUDENT || userType === UserType.PARENT) {
        throw new ForbiddenException('자료 목록 접근 권한이 없습니다.');
      }
    }

    const queryWithBackendType = {
      ...query,
      type: query.type ? toBackendMaterialType[query.type] : undefined,
    };

    // 목록 조회
    const { materials, totalCount } =
      await this.materialsRepository.findMany(queryWithBackendType);

    const mappedMaterials = materials.map((m) => {
      // MaterialType Mapping
      const type =
        toFrontendMaterialType[m.type as MaterialType] || ('OTHER' as const);

      const isVideo = m.type === MaterialType.VIDEO_LINK;
      const isManagement =
        userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
      const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
      const downloadUrl = `${basePath}/materials/${m.id}/download`; // 다운로드 URL (프론트에서 이 경로로 호출)

      return {
        id: m.id,
        title: m.title,
        description: m.description, // description 추가
        writer: m.authorName || '보조 강사', // writer <- authorName
        date: format(m.createdAt, 'yyyy-MM-dd'), // date <- createdAt
        type: type, // type 매핑
        classId: m.lectureId, // classId <- lectureId
        className: m.lecture?.title, // className <- lecture.title (Repository에서 가져옴)
        // file: 비디오가 아니면 { name, url } 반환
        file: !isVideo ? { name: m.title, url: downloadUrl } : undefined,
        // link: 비디오면 fileUrl 반환
        link: isVideo ? m.fileUrl : undefined,
      };
    });

    return {
      materials: mappedMaterials,
      pagination: {
        totalCount,
        totalPage: Math.ceil(totalCount / query.limit),
        currentPage: query.page,
        limit: query.limit,
        hasNextPage: query.page * query.limit < totalCount,
        hasPrevPage: query.page > 1,
      },
    };
  }

  /** 자료 수정 */
  async updateMaterial(
    materialsId: string,
    data: UpdateMaterialDto,
    userType: UserType,
    profileId: string,
  ) {
    const material = await this.materialsRepository.findById(materialsId);
    if (!material) throw new NotFoundException('자료를 찾을 수 없습니다.');
    // 권한 검증: 자료의 소유 강사 ID로 확인
    await this.permissionService.validateInstructorAccess(
      material.instructorId,
      userType,
      profileId,
    );

    let fileUrl = material.fileUrl;
    if (data.youtubeUrl && material.type === MaterialType.VIDEO_LINK) {
      fileUrl = this.validateYouTubeUrl(data.youtubeUrl);
    }

    return this.materialsRepository.update(materialsId, {
      title: data.title,
      fileUrl,
      description: data.description,
      subject: data.subject,
      externalDownloadUrl: data.externalDownloadUrl,
    });
  }

  /** 자료 삭제 */
  async deleteMaterial(
    materialsId: string,
    userType: UserType,
    profileId: string,
  ) {
    const material = await this.materialsRepository.findById(materialsId);
    if (!material) throw new NotFoundException('자료를 찾을 수 없습니다.');

    // 권한 검증: 자료의 소유 강사 ID로 확인
    await this.permissionService.validateInstructorAccess(
      material.instructorId,
      userType,
      profileId,
    );

    // Soft Delete 수행 (S3 파일은 Lifecycle 정책에 따라 삭제되도록 원본 보존 권장)
    // 현재 Repository는 deletedAt: null인 것만 조회하므로, 소통 게시글에서도 안 보이게 됨.
    // 하지만 S3 파일 자체는 남아있으므로 URL을 이미 아는 학생은 접근 가능할 수 있음. (보안)
    await this.materialsRepository.softDelete(materialsId);
  }

  /** 자료 상세 조회 */
  async getMaterialDetail(
    materialsId: string,
    userType: UserType,
    profileId: string,
  ) {
    const material = await this.materialsRepository.findById(materialsId);
    if (!material) throw new NotFoundException('자료를 찾을 수 없습니다.');

    // 권한 확인: 강의 자료인 경우 해당 강의 읽기 권한 확인
    if (material.lectureId) {
      const lecture = await this.lecturesRepository.findById(
        material.lectureId,
      );

      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

      await this.permissionService.validateLectureReadAccess(
        material.lectureId,
        { instructorId: lecture.instructorId },
        userType,
        profileId,
      );
    } else {
      // 라이브러리(강의 미지정) 자료: 학생/학부모는 접근 불가
      // 기획에 따라 변동 가능
      if (userType === UserType.STUDENT || userType === UserType.PARENT) {
        throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
      }
    }

    // MaterialType Mapping
    const type =
      toFrontendMaterialType[material.type as MaterialType] ||
      ('OTHER' as const);

    const isVideo = material.type === MaterialType.VIDEO_LINK;
    const isManagement =
      userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
    const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
    const downloadUrl = `${basePath}/materials/${material.id}/download`;

    return {
      id: material.id,
      title: material.title,
      description: material.description,
      writer: material.authorName || '보조 강사',
      date: format(material.createdAt, 'yyyy-MM-dd'),
      type: type,
      classId: material.lectureId,
      className: material.lecture?.title,
      file: !isVideo ? { name: material.title, url: downloadUrl } : undefined,
      link: isVideo ? material.fileUrl : undefined,
    };
  }

  /** 다운로드 URL 획득 */
  async getDownloadUrl(
    materialsId: string,
    userType: UserType,
    profileId: string,
  ) {
    const material = await this.materialsRepository.findById(materialsId);
    if (!material) throw new NotFoundException('자료를 찾을 수 없습니다.');

    // 권한 확인
    if (material.lectureId) {
      const lecture = await this.lecturesRepository.findById(
        material.lectureId,
      );
      if (!lecture)
        throw new NotFoundException('강의 정보를 찾을 수 없습니다.');

      await this.permissionService.validateLectureReadAccess(
        material.lectureId,
        { instructorId: lecture.instructorId },
        userType,
        profileId,
      );

      // 학생인 경우 추가 접근 제어 (게시글 타겟팅 확인)
      if (userType === UserType.STUDENT && material.lectureId) {
        const enrollment =
          await this.lectureEnrollmentsRepository.findByLectureIdAndStudentId(
            material.lectureId,
            profileId,
          );
        if (!enrollment) {
          throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
        }
        const isAccessible =
          await this.materialsRepository.isAccessibleByStudent(
            materialsId,
            enrollment.enrollmentId,
            material.lectureId,
          );
        if (!isAccessible) {
          throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
        }
      }
    } else {
      // 라이브러리 자료: 학생/학부모 접근 불가
      if (userType === UserType.STUDENT || userType === UserType.PARENT) {
        throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
      }
    }

    if (material.type === MaterialType.VIDEO_LINK) {
      return { url: material.fileUrl, type: 'youtube' };
    }

    const presignedUrl = await this.fileStorageService.getPresignedUrl(
      material.fileUrl,
    );
    return { url: presignedUrl, type: 'file' };
  }

  // ----------------------------------------------------------------
  // Private Helper Methods
  // ----------------------------------------------------------------

  private validateYouTubeUrl(url: string): string {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      throw new BadRequestException('유효하지 않은 YouTube URL입니다.');
    }
    return url;
  }
}
