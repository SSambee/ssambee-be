import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { s3Client } from '../middlewares/multer.middleware.js';
import { config } from '../config/env.config.js';

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
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

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
      ResponseContentDisposition: `attachment; filename="${encodedFileName}"; filename*=UTF-8''${encodedFileName}`,
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
