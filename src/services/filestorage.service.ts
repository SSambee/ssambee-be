import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, bucketName } from '../middlewares/multer.middleware.js';
import { config } from '../config/env.config.js';

export class FileStorageService {
  // Shared client uses Singleton pattern from middleware
  constructor() {}

  /**
   * 파일 업로드
   * @param file Multer File 객체
   * @param key 저장할 경로 (예: materials/uuid-filename.pdf)
   * @returns 업로드된 파일의 S3 URL (혹은 Key)
   */
  async upload(file: Express.Multer.File, key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    // URL 반환 시: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
    // 하지만 보통 DB에는 Key나 전체 URL을 저장. 여기서는 URL 포맷으로 저장한다고 가정.
    return `https://${bucketName}.s3.${config.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * 다운로드용 Presigned URL 생성
   * @param fileUrl 저장된 파일 URL
   * @param expiresIn 유효 시간 (초)
   */
  async getPresignedUrl(
    fileUrl: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const key = this.extractKeyFromUrl(fileUrl);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * 파일 삭제
   * @param fileUrl 저장된 파일 URL
   */
  async delete(fileUrl: string): Promise<void> {
    const key = this.extractKeyFromUrl(fileUrl);
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

  private extractKeyFromUrl(url: string): string {
    // URL 형태: https://bucket.s3.amazonaws.com/path/to/key
    // 간단히 도메인 이후 path를 key로 사용
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.startsWith('/')
        ? urlObj.pathname.slice(1)
        : urlObj.pathname;
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Unknown URL Parse Error';
      // 운영 환경에서도 알 수 있게 경고 로그 출력
      console.error(
        `[FileStorageService] 유효하지 않은 URL 입력됨: "${url}" - 원인: ${errorMessage}`,
      );
      // 진행을 막기 위해 에러를 다시 던짐
      throw new Error(`파일 키 추출 실패: ${errorMessage}`);
    }
  }
}
