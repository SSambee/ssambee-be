import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { s3Client } from '../middlewares/multer.middleware.js';
import { config } from '../config/env.config.js';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'node:fs';

/** S3 버킷 타입 정의 */
export const BucketType = {
  DOCUMENTS: 'documents',
  REPORTS: 'reports',
} as const;

type BucketType = (typeof BucketType)[keyof typeof BucketType];

/** 버킷 이름 반환 헬퍼 */
const getBucketName = (
  bucketType: BucketType = BucketType.DOCUMENTS,
): string => {
  return bucketType === BucketType.REPORTS
    ? config.AWS_S3_BUCKET_REPORTS
    : config.AWS_S3_BUCKET_DOCUMENTS;
};

/** 버킷 타입에 따른 CloudFront URL  반환*/
const getCloudFrontUrl = (bucketType: BucketType): string => {
  return bucketType === BucketType.DOCUMENTS
    ? config.AWS_CLOUDFRONT_URL_DOCUMENTS
    : config.AWS_CLOUDFRONT_URL_REPORTS;
};

export class FileStorageService {
  constructor() {}

  /**
   *  프라이빗 키를 가져오는 통합 로직
   * 1. 메모리 캐시 확인
   * 2. .env 확인 (Github Secrets 배포 환경용)
   * 3. 로컬 파일 확인
   * 4. 위 조건 모두 실패 시 SSM에서 로드 (로컬 개발용)
   * @returns
   */
  private loadPrivateKey(): string {
    return config.AWS_CLOUDFRONT_PRIVATE_KEY;
  }

  /**
   * 파일 업로드
   * @param file Multer File 객체
   * @param key 저장할 경로 (예: materials/uuid-filename.pdf)
   * @param bucketType 버킷 타입 (기본값: documents)
   * @returns 업로드된 파일의 URL (CloudFront URL이 설정된 경우 CloudFront URL, 그렇지 않으면 S3 URL)
   */
  async upload(
    file: Express.Multer.File,
    key: string,
    bucketType: BucketType = BucketType.DOCUMENTS,
  ): Promise<string> {
    const bucketName = getBucketName(bucketType);
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fs.createReadStream(file.path!),
      ContentType: file.mimetype,
    });

    try {
      await s3Client.send(command);
    } finally {
      fs.unlinkSync(file.path!);
    }

    // CloudFront URL이 설정된 경우 CloudFront URL 반환
    const cloudFrontUrl = getCloudFrontUrl(bucketType);
    return cloudFrontUrl
      ? `https://${cloudFrontUrl}/${key}`
      : `https://${bucketName}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * 열람용 Presigned URL 생성 (새 탭에서 열기)
   * @param fileUrl 저장된 파일 URL
   * @param expiresIn 유효 시간 (초)
   * @param bucketType 버킷 타입 (기본값: documents)
   */
  async getPresignedUrl(
    fileUrl: string,
    expiresIn: number = 3600,
    bucketType: BucketType = BucketType.DOCUMENTS,
  ): Promise<string> {
    const key = this.extractKeyFromUrl(fileUrl);
    const bucketName = getBucketName(bucketType);

    // CloudFront Signed URL 생성 (CloudFront가 설정된 경우)
    const cloudFrontUrl = getCloudFrontUrl(bucketType);
    const keyPairId = config.AWS_CLOUDFRONT_KEY_PAIR_ID;
    const privateKey = await this.loadPrivateKey(); // 비동기 키 획득

    if (cloudFrontUrl && keyPairId && privateKey) {
      try {
        return getCloudFrontSignedUrl({
          url: `https://${cloudFrontUrl}/${key}`,
          keyPairId,
          privateKey,
          dateLessThan: new Date(Date.now() + expiresIn * 1000),
        });
      } catch (error) {
        console.error('[FileStorageService] CF 서명 실패, S3 폴백', error);
      }
    }

    // S3 Fallback
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return getS3SignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * 다운로드용 Presigned URL 생성 (Content-Disposition: attachment)
   * @param fileUrl 저장된 파일 URL
   * @param fileName 다운로드 시 표시될 파일명
   * @param expiresIn 유효 시간 (초)
   * @param bucketType 버킷 타입 (기본값: documents)
   */
  async getDownloadPresignedUrl(
    fileUrl: string,
    fileName: string,
    expiresIn: number = 3600,
    bucketType: BucketType = BucketType.DOCUMENTS,
  ): Promise<string> {
    const key = this.extractKeyFromUrl(fileUrl);
    const bucketName = getBucketName(bucketType);
    const encodedFileName = encodeURIComponent(fileName);

    // CloudFront Signed URL 생성 (CloudFront가 설정된 경우)
    const cloudFrontUrl = getCloudFrontUrl(bucketType);
    const keyPairId = config.AWS_CLOUDFRONT_KEY_PAIR_ID;
    const privateKey = await this.loadPrivateKey();

    if (cloudFrontUrl && keyPairId && privateKey) {
      try {
        return getCloudFrontSignedUrl({
          url: `https://${cloudFrontUrl}/${key}?response-content-disposition=${encodeURIComponent(`attachment; filename="${encodedFileName}"`)}`,
          keyPairId,
          privateKey,
          dateLessThan: new Date(Date.now() + expiresIn * 1000),
        });
      } catch (error) {
        console.error('[FileStorageService] CF 서명 실패, S3 폴백', error);
      }
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
    });

    return getS3SignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * 파일 삭제
   * @param fileUrl 저장된 파일 URL
   * @param bucketType 버킷 타입 (기본값: documents)
   */
  async delete(
    fileUrl: string,
    bucketType: BucketType = BucketType.DOCUMENTS,
  ): Promise<void> {
    const key = this.extractKeyFromUrl(fileUrl);
    const bucketName = getBucketName(bucketType);
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    try {
      await s3Client.send(command);
    } catch (error) {
      console.error(`Failed to delete file from S3: ${fileUrl}`, error);
      // 삭제 실패가 비즈니스 로직을 중단시키지 않도록 예외를 던지지 않음 (로그만 남김)
    }
  }

  /**
   * URL에서 파일 키 추출
   * S3 URL과 CloudFront URL 모두 지원
   * @param url 파일 URL
   * @returns S3 키
   */
  /**
   * 체파일 1개를 `attachments/{year}/{month}/{uuid}{ext}` 경로에 업로드
   * @returns `{ filename, fileUrl }` 업로드 결과
   */
  async uploadAttachment(
    file: Express.Multer.File,
  ): Promise<{ filename: string; fileUrl: string }> {
    const decodedOriginalName = Buffer.from(
      file.originalname,
      'latin1',
    ).toString('utf-8');
    const randomId = randomUUID();
    const ext = path.extname(decodedOriginalName);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `attachments/${year}/${month}/${randomId}${ext}`;

    const fileUrl = await this.upload(file, key);
    return { filename: decodedOriginalName, fileUrl };
  }

  /**
   * 여러 파일을 배치로 체파일 업로드
   * 파일이 없으면 빈 배열 반환
   */
  async uploadAttachments(
    files: Express.Multer.File[] | undefined,
  ): Promise<{ filename: string; fileUrl: string }[]> {
    if (!files?.length) return [];
    const results: { filename: string; fileUrl: string }[] = [];
    try {
      for (const file of files) {
        results.push(await this.uploadAttachment(file));
      }
      return results;
    } catch (error) {
      await this.cleanup(results);
      throw error;
    }
  }

  /**
   * 체파일 배열의 fileUrl을 Presigned URL로 교체
   * material.fileUrl → 루트 fileUrl 승격도 포함 (normalizeAttachments 대체)
   */
  async resolvePresignedUrls<
    T extends {
      fileUrl: string | null;
      material?: { fileUrl: string | null } | null;
    },
  >(attachments: T[] | null | undefined): Promise<T[]> {
    if (!attachments) return [];
    return Promise.all(
      attachments.map(async (attr) => {
        const url = attr.fileUrl || attr.material?.fileUrl || null;
        const presignedUrl = url ? await this.getPresignedUrl(url) : null;
        return { ...attr, fileUrl: presignedUrl };
      }),
    );
  }

  /**
   * 업로드된 파일들을 정리 (오류 발생 시 클린업용)
   * @param uploadedFiles 업로드된 파일 정보 배열
   * @param bucketType 버킷 타입
   */
  async cleanup(
    uploadedFiles: { fileUrl: string | null | undefined }[],
    bucketType: BucketType = BucketType.DOCUMENTS,
  ): Promise<void> {
    if (!uploadedFiles?.length) return;

    await Promise.allSettled(
      uploadedFiles
        .map((f) => f.fileUrl)
        .filter((url): url is string => Boolean(url))
        .map((url) => this.delete(url, bucketType)),
    );
  }

  /** 키 추출 */
  private extractKeyFromUrl(url: string): string {
    // CloudFront URL 형태: https://d123.cloudfront.net/path/to/key
    // S3 URL 형태: https://bucket.s3.amazonaws.com/path/to/key
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.startsWith('/')
        ? urlObj.pathname.slice(1)
        : urlObj.pathname;
    } catch (e) {
      throw new Error(`파일 키 추출 실패: ${url} ${e}`);
    }
  }
}
