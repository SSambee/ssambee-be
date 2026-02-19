import { NextFunction, Request, Response } from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { FileStorageService } from '../services/filestorage.service.js';
import { successResponse } from '../utils/response.util.js';
import { BadRequestException } from '../err/http.exception.js';

export class UploadsController {
  constructor(private readonly fileStorageService: FileStorageService) {}

  /**
   * 파일 업로드 (학생/학부모용)
   * S3 경로: attachments/YYYY/MM/UUID.ext
   */
  uploadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;

      if (!file) {
        throw new BadRequestException('파일이 없습니다.');
      }

      const randomId = randomUUID();
      const ext = path.extname(file.originalname);
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');

      // 학생/학부모 첨부파일은 attachments 폴더로 구분
      const key = `attachments/${year}/${month}/${randomId}${ext}`;

      const fileUrl = await this.fileStorageService.upload(file, key);

      return successResponse(res, {
        statusCode: 201,
        data: {
          filename: file.originalname,
          fileUrl: fileUrl,
        },
        message: '파일이 성공적으로 업로드되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
