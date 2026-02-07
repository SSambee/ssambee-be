import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { MaterialType } from '../constants/materials.constant.js';
import { UserType } from '../constants/auth.constant.js';
import { MaterialsRepository } from '../repos/materials.repo.js';
import { LecturesRepository } from '../repos/lectures.repo.js';
import { PermissionService } from './permission.service.js';
import { FileStorageService } from './filestorage.service.js';
import {
  UploadMaterialDto,
  UpdateMaterialDto,
  GetMaterialsQueryDto,
} from '../validations/materials.validation.js';
import { config } from '../config/env.config.js';

import { LectureEnrollmentsRepository } from '../repos/lecture-enrollments.repo.js';

export class MaterialsService {
  constructor(
    private readonly materialsRepository: MaterialsRepository,
    private readonly lecturesRepository: LecturesRepository,
    private readonly lectureEnrollmentsRepository: LectureEnrollmentsRepository,
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
    if (lectureId) {
      const lecture = await this.lecturesRepository.findById(lectureId);
      if (!lecture) throw new NotFoundException('강의를 찾을 수 없습니다.');

      await this.permissionService.validateInstructorAccess(
        lecture.instructorId,
        userType,
        profileId,
      );
    }

    let fileUrl: string;

    if (data.type === MaterialType.VIDEO_LINK) {
      if (!data.youtubeUrl) {
        throw new BadRequestException('동영상 링크가 필요합니다.');
      }
      fileUrl = this.validateYouTubeUrl(data.youtubeUrl);
    } else {
      if (!file) {
        throw new BadRequestException('파일 업로드가 필요합니다.');
      }
      fileUrl =
        (file as Express.MulterS3.File).location ||
        (file as Express.MulterS3.File).key;

      if (!fileUrl) {
        throw new BadRequestException('파일 업로드 처리에 실패했습니다.');
      }

      // fallback
      if (!fileUrl.startsWith('http')) {
        const bucket = config.AWS_S3_BUCKET;
        const region = config.AWS_REGION;
        fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${fileUrl}`;
      }
    }

    const uploader = {
      uploaderInstructorId:
        userType === UserType.INSTRUCTOR ? profileId : undefined,
      uploaderAssistantId:
        userType === UserType.ASSISTANT ? profileId : undefined,
    };

    return this.materialsRepository.create({
      lectureId: lectureId || null,
      title: data.title,
      fileUrl,
      type: data.type,
      description: data.description,
      subject: data.subject,
      externalDownloadUrl: data.externalDownloadUrl,
      ...uploader,
    });
  }

  /** 자료 목록 조회 */
  async getMaterials(
    query: GetMaterialsQueryDto & { lectureId?: string },
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

    // 목록 조회
    const { materials, totalCount } =
      await this.materialsRepository.findMany(query);

    const mappedMaterials = materials.map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      uploaderName:
        m.instructor?.user.name || m.assistant?.user.name || '알 수 없음',
      createdAt: m.createdAt,
      // URL은 직접 노출하지 않거나, VIDEO_LINK인 경우만 노출
      isYoutube: m.type === MaterialType.VIDEO_LINK,
      lectureId: m.lectureId,
    }));

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
    const result = await this.materialsRepository.update(materialsId, data);

    if (result.count === 0) {
      throw new NotFoundException(
        '수정할 자료를 찾을 수 없거나 이미 삭제되었습니다.',
      );
    }

    const material = await this.materialsRepository.findById(materialsId);
    if (!material) throw new NotFoundException('자료를 찾을 수 없습니다.');

    // 소유 강사 ID 식별 (직접 업로드 -> 조교의 강사 -> 강의 담당 강사 순)
    let ownerInstructorId =
      material.uploaderInstructorId || material.assistant?.instructorId;

    if (!ownerInstructorId && material.lectureId) {
      const lecture = await this.lecturesRepository.findById(
        material.lectureId,
      );
      ownerInstructorId = lecture?.instructorId;
    }

    if (!ownerInstructorId) {
      throw new ForbiddenException('자료 권한을 확인할 수 없습니다.');
    }

    // 권한 검증
    await this.permissionService.validateInstructorAccess(
      ownerInstructorId,
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

    // 소유 강사 ID 식별 (직접 업로드 -> 조교의 강사 -> 강의 담당 강사 순)
    let ownerInstructorId =
      material.uploaderInstructorId || material.assistant?.instructorId;

    if (!ownerInstructorId && material.lectureId) {
      const lecture = await this.lecturesRepository.findById(
        material.lectureId,
      );
      ownerInstructorId = lecture?.instructorId;
    }

    if (!ownerInstructorId) {
      throw new ForbiddenException('자료 권한을 확인할 수 없습니다.');
    }

    // 권한 검증
    await this.permissionService.validateInstructorAccess(
      ownerInstructorId,
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

    return {
      title: material.title,
      type: material.type,
      description: material.description,
      subject: material.subject,
      fileUrl:
        material.type === MaterialType.VIDEO_LINK
          ? material.fileUrl
          : undefined,
      externalDownloadUrl: material.externalDownloadUrl,
      uploaderName:
        material.instructor?.user.name ||
        material.assistant?.user.name ||
        '알 수 없음',
      createdAt: material.createdAt,
      updatedAt: material.updatedAt,
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
        if (enrollment) {
          const isAccessible =
            await this.materialsRepository.isAccessibleByStudent(
              materialsId,
              enrollment.enrollmentId,
            );
          if (!isAccessible) {
            throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
          }
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
