import path from 'path';
import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { S3Client } from '@aws-sdk/client-s3';
import { BadRequestException } from '../err/http.exception.js';
import { config } from '../config/env.config.js';

// S3 Client 설정
export const s3Client = new S3Client({
  region: config.AWS_REGION,
});

// storage setting: memoryStorage
const storage = multer.memoryStorage();

/** 파일 필터링 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  done: FileFilterCallback,
): void => {
  // MIME 타입 목록
  const allowedMimeTypes = [
    // 이미지
    'image/jpeg',
    'image/jpg',
    'image/png',
    // 맥 전용 이미지 (HEIC/HEIF)
    'image/heic',
    'image/heif',
    'image/heic-sequence',
    'image/heif-sequence',
    // PDF
    'application/pdf',
    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // Excel
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12', // XLSM
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    // PowerPoint
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    // 텍스트
    'text/plain',
    // 알 수 없는 바이너리 파일 (확장자로 체크)
    'application/octet-stream',
  ];

  // HWP 파일 확장자 (브라우저에서 MIME 타입이 다르게 전송될 수 있음)
  // 맥 전용 이미지 확장자 (HEIC/HEIF)
  const allowedExtensions = ['.hwp', '.hwpx', '.heic', '.heif'];

  // 파일 확장자 추출
  const ext = path.extname(file.originalname).toLowerCase();

  // MIME 타입이 허용 목록에 있거나, HWP 확장자이면 허용
  if (
    allowedMimeTypes.includes(file.mimetype) ||
    allowedExtensions.includes(ext)
  ) {
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
