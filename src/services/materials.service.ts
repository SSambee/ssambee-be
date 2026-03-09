import path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { toKstDateOnly } from '../utils/date.util.js';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import { MaterialType } from '../constants/materials.constant.js';
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
    private readonly Prisma: PrismaClient,
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

    if (data.type === MaterialType.VIDEO) {
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
      authorName = instructor.user?.name ?? '알 수 없음';
      authorRole = UserType.INSTRUCTOR;
    } else if (userType === UserType.ASSISTANT) {
      const assistant = await this.assistantRepository.findById(profileId);
      if (!assistant)
        throw new NotFoundException('조교 정보를 찾을 수 없습니다.');
      ownerInstructorId = assistant.instructorId;
      authorName = assistant.user?.name ?? '보조강사';
      authorRole = UserType.ASSISTANT;
    } else {
      throw new ForbiddenException('자료 업로드 권한이 없습니다.');
    }

    const created = await this.materialsRepository.create({
      instructorId: ownerInstructorId,
      lectureId: null, // 원본 보존을 위해 무조건 null로 저장 (Library-first)
      authorName,
      authorRole,
      title: data.title,
      filename: file?.originalname ?? '',
      fileUrl,
      type: data.type,
      description: data.description,
      subject: data.subject,
      externalDownloadUrl: data.externalDownloadUrl,
    });

    // 프론트엔드용 응답 형식으로 변환
    const isVideo = data.type === MaterialType.VIDEO;
    const isManagement =
      userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
    const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
    const downloadUrl = `${basePath}/materials/${created.id}/download`;

    return {
      id: created.id,
      title: created.title,
      description: created.description,
      writer: authorName,
      date: toKstDateOnly(created.createdAt),
      type: data.type,
      file: !isVideo ? { name: created.filename, url: downloadUrl } : undefined,
      link: isVideo ? created.fileUrl : undefined,
      externalDownloadUrl: created.externalDownloadUrl ?? undefined,
    };
  }

  /** 자료 목록 조회 */
  async getMaterials(
    query: GetMaterialsQueryDto & {
      lectureId?: string;
      type?: MaterialType;
    },
    userType: UserType,
    profileId: string,
  ) {
    const { lectureId } = query;
    let finalInstructorId = undefined;

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
      // 라이브러리 조회 시: 강사/조교는 본인/담당 강사 자료만 조회
      const effectiveId = await this.permissionService.getEffectiveInstructorId(
        userType,
        profileId,
      );
      if (!effectiveId) {
        throw new ForbiddenException('자료 목록 접근 권한이 없습니다.');
      }
      finalInstructorId = effectiveId;
    }

    // 목록 조회
    const { materials, totalCount } = await this.materialsRepository.findMany({
      ...query,
      instructorId: finalInstructorId,
    });

    // 작성자(Author) 유효성 체크 및 마스킹 데이터 준비
    const instructorIds = [...new Set(materials.map((m) => m.instructorId))];
    const assistantsMap = new Map<string, string[]>(); // instructorId -> activeAssistantNames[]

    await Promise.all(
      instructorIds.map(async (id) => {
        const assistants =
          await this.assistantRepository.findAllByInstructorId(id);
        assistantsMap.set(
          id,
          assistants.map((a) => a.user?.name ?? ''),
        );
      }),
    );

    const mappedMaterials = materials.map((m) => {
      const isVideo = m.type === MaterialType.VIDEO;
      const isManagement =
        userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
      const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
      const downloadUrl = `${basePath}/materials/${m.id}/download`;

      // 작성자 마스킹 로직
      let writer = m.authorName || '보조강사';
      if (m.authorRole === UserType.ASSISTANT) {
        const activeNames = assistantsMap.get(m.instructorId) || [];
        if (!activeNames.includes(m.authorName)) {
          writer = '보조강사';
        }
      }

      return {
        id: m.id,
        title: m.title,
        description: m.description,
        writer, // 마스킹된 이름 반영
        date: toKstDateOnly(m.createdAt),
        type: m.type as MaterialType,
        file: !isVideo ? { name: m.filename, url: downloadUrl } : undefined,
        link: isVideo ? m.fileUrl : undefined,
        externalDownloadUrl: m.externalDownloadUrl ?? undefined,
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
    file?: Express.Multer.File,
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

    // 유튜브 링크 수정 (VIDEO 타입인 경우)
    if (data.youtubeUrl && material.type === MaterialType.VIDEO) {
      fileUrl = this.validateYouTubeUrl(data.youtubeUrl);
    }

    // 파일 교체 (VIDEO 타입이 아닌 경우)
    if (file && material.type !== MaterialType.VIDEO) {
      // 새 파일 업로드
      const randomId = randomUUID();
      const ext = path.extname(file.originalname);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const prefix = material.type.toLowerCase();
      const key = `${prefix}/${year}/${month}/${randomId}${ext}`;

      fileUrl = await this.fileStorageService.upload(file, key);
      await this.fileStorageService.delete(material.fileUrl);
    }

    const updateData: Prisma.MaterialUpdateInput = {
      title: data.title,
      fileUrl,
      description: data.description,
      subject: data.subject,
      externalDownloadUrl: data.externalDownloadUrl,
    };

    // 파일이 교체된 경우 filename도 업데이트
    if (file && material.type !== MaterialType.VIDEO) {
      updateData.filename = file.originalname;
    }

    const updated = await this.materialsRepository.update(
      materialsId,
      updateData,
    );

    // 프론트엔드용 응답 형식으로 변환
    const isVideo = material.type === MaterialType.VIDEO;
    const isManagement =
      userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
    const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
    const downloadUrl = `${basePath}/materials/${updated.id}/download`;

    return {
      id: updated.id,
      title: updated.title,
      description: updated.description,
      writer: material.authorName,
      date: toKstDateOnly(updated.updatedAt),
      type: material.type as MaterialType,
      file: !isVideo ? { name: updated.filename, url: downloadUrl } : undefined,
      link: isVideo ? updated.fileUrl : undefined,
      externalDownloadUrl: updated.externalDownloadUrl ?? undefined,
    };
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

    // Soft Delete 수행
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
      // 라이브러리(강의 미지정) 자료: 소유권 확인
      await this.permissionService.validateInstructorAccess(
        material.instructorId,
        userType,
        profileId,
      );
    }

    // 작성자 마스킹 로직
    let writer = material.authorName || '보조강사';
    if (material.authorRole === UserType.ASSISTANT) {
      const activeAssistants =
        await this.assistantRepository.findAllByInstructorId(
          material.instructorId,
        );
      const activeNames = activeAssistants.map((a) => a.user?.name ?? '');
      if (!activeNames.includes(material.authorName)) {
        writer = '보조강사';
      }
    }

    const isVideo = material.type === MaterialType.VIDEO;
    const isManagement =
      userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT;
    const basePath = isManagement ? '/api/mgmt/v1' : '/api/svc/v1';
    const downloadUrl = `${basePath}/materials/${material.id}/download`;

    return {
      id: material.id,
      title: material.title,
      description: material.description,
      writer, // 마스킹된 이름 반영
      date: toKstDateOnly(material.createdAt),
      type: material.type as MaterialType,
      file: !isVideo
        ? { name: material.filename, url: downloadUrl }
        : undefined,
      link: isVideo ? material.fileUrl : undefined,
      externalDownloadUrl: material.externalDownloadUrl ?? undefined,
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
    if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
      // 강사/조교: 소유권 확인
      const effectiveInstructorId =
        await this.permissionService.getEffectiveInstructorId(
          userType,
          profileId,
        );

      if (!effectiveInstructorId) {
        throw new ForbiddenException('강사 정보를 찾을 수 없습니다.');
      }

      await this.permissionService.validateInstructorAccess(
        material.instructorId,
        userType,
        profileId,
      );
    } else if (userType === UserType.STUDENT) {
      // 학생: 강의 자료 또는 게시글 첨부 자료 확인
      if (material.lectureId) {
        const isEnrolled =
          await this.lectureEnrollmentsRepository.existsByLectureIdAndStudentId(
            material.lectureId,
            profileId,
          );
        if (!isEnrolled) {
          throw new ForbiddenException('수강 중인 강의가 아닙니다.');
        }
      }

      const enrollment =
        await this.lectureEnrollmentsRepository.findFirstByInstructorIdAndStudentId(
          material.instructorId,
          profileId,
        );

      if (!enrollment) {
        throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
      }

      const isAccessible = await this.materialsRepository.isAccessibleByStudent(
        materialsId,
        enrollment.enrollmentId,
        material.lectureId ?? undefined,
      );

      if (!isAccessible) {
        throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
      }
    } else if (userType === UserType.PARENT) {
      // 학부모: 자녀의 자료 접근 권한 확인
      const enrollmentIds =
        await this.permissionService.getParentEnrollmentIds(profileId);
      if (!enrollmentIds || enrollmentIds.length === 0) {
        throw new ForbiddenException('연결된 자녀 수강 정보가 없습니다.');
      }

      if (material.lectureId) {
        await this.permissionService.validateParentLectureAccess(
          profileId,
          material.lectureId,
        );
      }

      let hasAccess = false;
      for (const enrollmentId of enrollmentIds) {
        const isAccessible =
          await this.materialsRepository.isAccessibleByStudent(
            materialsId,
            enrollmentId,
            material.lectureId ?? undefined,
          );
        if (isAccessible) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        throw new ForbiddenException('해당 자료에 접근 권한이 없습니다.');
      }
    } else {
      throw new ForbiddenException('접근 권한이 없습니다.');
    }

    if (material.type === MaterialType.VIDEO) {
      return { url: material.fileUrl, type: 'youtube' };
    }

    // 파일 확장자 추출 (S3 URL에서)
    const fileExt = path.extname(material.fileUrl);
    const downloadFileName = `${material.title}${fileExt}`;

    const presignedUrl = await this.fileStorageService.getDownloadPresignedUrl(
      material.fileUrl,
      downloadFileName,
      3600,
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
