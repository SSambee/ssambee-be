/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

import { FileStorageService, BucketType } from './filestorage.service.js';
import { config } from '../config/env.config.js';

// Jest 호환성을 위해 vi 대신 jest 사용
const vi = {
  fn: jest.fn,
};

describe('파일 스토리지 서비스', () => {
  let service: FileStorageService;
  let mockS3ClientSend: jest.Mock;

  beforeEach(() => {
    service = new FileStorageService();
    // S3 Client send 메서드 spy 생성
    const { s3Client } = require('../middlewares/multer.middleware.js');
    mockS3ClientSend = vi.fn();
    jest.spyOn(s3Client, 'send').mockImplementation(mockS3ClientSend);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('파일 업로드', () => {
    const createMockFile = (
      overrides?: Partial<Express.Multer.File>,
    ): Express.Multer.File => {
      const file: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
        size: 12,
        destination: '',
        filename: '',
        path: '',
        // @ts-expect-error - stream is not needed for tests
        stream: null,
        ...overrides,
      };
      return file;
    };

    it('Documents 버킷에 파일을 업로드하면 CloudFront URL을 반환한다', async () => {
      // Arrange
      const mockFile = createMockFile({ originalname: 'test.pdf' });
      const key = 'materials/test-uuid.pdf';
      const cloudFrontUrl = config.AWS_CLOUDFRONT_URL_DOCUMENTS;

      mockS3ClientSend.mockResolvedValue({});

      // Act
      const result = await service.upload(mockFile, key, BucketType.DOCUMENTS);

      // Assert
      expect(result).toBe(`https://${cloudFrontUrl}/${key}`);
      expect(mockS3ClientSend).toHaveBeenCalled();
    });

    it('Reports 버킷에 파일을 업로드하면 Reports CloudFront URL을 반환한다', async () => {
      // Arrange
      const mockFile = createMockFile({
        originalname: 'report.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('excel content'),
      });
      const key = 'reports/2024/quarterly.xlsx';
      const cloudFrontUrl = config.AWS_CLOUDFRONT_URL_REPORTS;

      mockS3ClientSend.mockResolvedValue({});

      // Act
      const result = await service.upload(mockFile, key, BucketType.REPORTS);

      // Assert
      expect(result).toBe(`https://${cloudFrontUrl}/${key}`);
    });

    it('CloudFront URL이 설정되지 않으면 S3 URL을 반환한다', async () => {
      // Arrange
      const mockFile = createMockFile();
      const key = 'materials/test.pdf';
      const bucketName = config.AWS_S3_BUCKET_DOCUMENTS;

      mockS3ClientSend.mockResolvedValue({});

      const originalCloudFrontUrl = config.AWS_CLOUDFRONT_URL_DOCUMENTS;
      (config as any).AWS_CLOUDFRONT_URL_DOCUMENTS = '';

      // Act
      try {
        const result = await service.upload(
          mockFile,
          key,
          BucketType.DOCUMENTS,
        );

        // Assert
        expect(result).toBe(
          `https://${bucketName}.s3.${config.AWS_REGION}.amazonaws.com/${key}`,
        );
      } finally {
        (config as any).AWS_CLOUDFRONT_URL_DOCUMENTS = originalCloudFrontUrl;
      }
    });
  });

  describe('파일 삭제', () => {
    it('S3에서 파일을 삭제한다', async () => {
      // Arrange
      const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';

      mockS3ClientSend.mockResolvedValue({});

      // Act
      await service.delete(fileUrl, BucketType.DOCUMENTS);

      // Assert
      expect(mockS3ClientSend).toHaveBeenCalled();
    });

    it('삭제 실패 시 에러를 던지지 않고 gracefully 처리한다', async () => {
      // Arrange
      const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';

      mockS3ClientSend.mockRejectedValue(new Error('S3 delete failed'));

      // Act & Assert
      await expect(service.delete(fileUrl)).resolves.not.toThrow();
    });
  });

  describe('URL에서 파일 키 추출', () => {
    it('CloudFront URL에서 키를 정확하게 추출한다', () => {
      // Arrange
      const url = 'https://d123.cloudfront.net/path/to/file.pdf';

      // Act
      const key = (service as any).extractKeyFromUrl(url);

      // Assert
      expect(key).toBe('path/to/file.pdf');
    });

    it('S3 URL에서 키를 정확하게 추출한다', () => {
      // Arrange
      const url = 'https://bucket.s3.amazonaws.com/path/to/file.pdf';

      // Act
      const key = (service as any).extractKeyFromUrl(url);

      // Assert
      expect(key).toBe('path/to/file.pdf');
    });

    it('리전이 포함된 S3 URL에서도 키를 정확하게 추출한다', () => {
      // Arrange
      const url =
        'https://bucket.s3.ap-northeast-2.amazonaws.com/path/to/file.pdf';

      // Act
      const key = (service as any).extractKeyFromUrl(url);

      // Assert
      expect(key).toBe('path/to/file.pdf');
    });

    it('잘못된 URL이면 에러를 발생시킨다', () => {
      // Arrange
      const url = 'not-a-valid-url';

      // Act & Assert
      expect(() => (service as any).extractKeyFromUrl(url)).toThrow(
        '파일 키 추출 실패',
      );
    });
  });
});
