import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { S3Client } from '@aws-sdk/client-s3';
import { BadRequestException } from '../err/http.exception.js';
import { config } from '../config/env.config.js';

// S3 Client 설정
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
    // 이미지
    'image/jpeg',
    'image/jpg',
    'image/png',
    // PDF
    'application/pdf',
    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // HWP (한국형 한글문서)
    'application/x-hwp',
    'application/hwp',
    'application/x-hwp+zip',
    // Excel
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12', // XLSM
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    // PowerPoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    // 텍스트
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
