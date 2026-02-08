import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { S3Client } from '@aws-sdk/client-s3';
import { BadRequestException } from '../err/http.exception.js';
import { config } from '../config/env.config.js';

// S3 Client 설정
export const bucketName = config.AWS_S3_BUCKET;
export const s3Client = new S3Client({
  region: config.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

// storage setting: memoryStorage
const storage = multer.memoryStorage();

/** 파일 필터링 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  done: FileFilterCallback,
): void => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf', // PDF 추가
    'application/msword', // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/vnd.ms-powerpoint', // PPT
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'text/plain',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    done(null, true);
  } else {
    done(new BadRequestException('지원하지 않는 파일 형식입니다.'));
  }
};

/**
 * Multer Setting Object
 * - FileLimit: 100MB (기획서: 100MB) -> User Snippet: 5MB -> 다시 100MB로 조정 (Materials이므로)
 */
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});
