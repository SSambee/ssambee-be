/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */
import { config } from '../config/env.config.js';
import { FileStorageService, BucketType } from './filestorage.service.js';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';

// Jest 호환성을 위해 vi 대신 jest 사용
const vi = {
  fn: jest.fn,
};

// AWS SDK signers 모킹
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: jest.fn(),
}));

describe('파일 스토리지 서비스', () => {
  let service: FileStorageService;
  let mockS3ClientSend: jest.Mock;

  beforeEach(() => {
    service = new FileStorageService();
    // S3 Client send 메서드 spy 생성
    const { s3Client } = require('../middlewares/multer.middleware.js');
    mockS3ClientSend = vi.fn();
    jest.spyOn(s3Client, 'send').mockImplementation(mockS3ClientSend);

    // 테스트용 config 값 강제 설정 (CF 테스트용)
    (config as any).AWS_CLOUDFRONT_KEY_PAIR_ID = 'test-key-pair-id';
    (config as any).AWS_CLOUDFRONT_PRIVATE_KEY = 'test-private-key';
    (config as any).AWS_CLOUDFRONT_URL_DOCUMENTS = 'test.cloudfront.net';
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      // 준비
      const mockFile = createMockFile({ originalname: 'test.pdf' });
      const key = 'materials/test-uuid.pdf';
      const cloudFrontUrl = config.AWS_CLOUDFRONT_URL_DOCUMENTS;

      mockS3ClientSend.mockResolvedValue({});

      // 실행
      const result = await service.upload(mockFile, key, BucketType.DOCUMENTS);

      // 검증
      expect(result).toBe(`https://${cloudFrontUrl}/${key}`);
      expect(mockS3ClientSend).toHaveBeenCalled();
    });

    it('Reports 버킷에 파일을 업로드하면 Reports CloudFront URL을 반환한다', async () => {
      const mockFile = createMockFile({
        originalname: 'report.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from('excel content'),
      });
      const key = 'reports/2024/quarterly.xlsx';
      const cloudFrontUrl = config.AWS_CLOUDFRONT_URL_REPORTS;

      mockS3ClientSend.mockResolvedValue({});

      const result = await service.upload(mockFile, key, BucketType.REPORTS);

      expect(result).toBe(`https://${cloudFrontUrl}/${key}`);
    });

    it('CloudFront URL이 설정되지 않으면 S3 URL을 반환한다', async () => {
      const mockFile = createMockFile();
      const key = 'materials/test.pdf';
      const bucketName = config.AWS_S3_BUCKET_DOCUMENTS;

      mockS3ClientSend.mockResolvedValue({});

      const originalCloudFrontUrl = config.AWS_CLOUDFRONT_URL_DOCUMENTS;
      (config as any).AWS_CLOUDFRONT_URL_DOCUMENTS = '';

      try {
        const result = await service.upload(
          mockFile,
          key,
          BucketType.DOCUMENTS,
        );

        expect(result).toBe(
          `https://${bucketName}.s3.${config.AWS_REGION}.amazonaws.com/${key}`,
        );
      } finally {
        (config as any).AWS_CLOUDFRONT_URL_DOCUMENTS = originalCloudFrontUrl;
      }
    });
  });

  describe('파일 삭제', () => {
    it('S3에서 파일을 성공적으로 삭제해야 한다', async () => {
      const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';

      mockS3ClientSend.mockResolvedValue({});

      await service.delete(fileUrl, BucketType.DOCUMENTS);

      expect(mockS3ClientSend).toHaveBeenCalled();
    });

    it('삭제 실패 시 에러를 던지지 않고 정상적으로 처리해야 한다', async () => {
      const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';

      mockS3ClientSend.mockRejectedValue(new Error('S3 delete failed'));

      await expect(service.delete(fileUrl)).resolves.not.toThrow();
    });
  });

  describe('URL에서 파일 키 추출', () => {
    it('CloudFront URL에서 키를 정확하게 추출한다', () => {
      const url = 'https://d123.cloudfront.net/path/to/file.pdf';

      const key = (service as any).extractKeyFromUrl(url);

      expect(key).toBe('path/to/file.pdf');
    });

    it('S3 URL에서 키를 정확하게 추출한다', () => {
      const url = 'https://bucket.s3.amazonaws.com/path/to/file.pdf';

      const key = (service as any).extractKeyFromUrl(url);

      expect(key).toBe('path/to/file.pdf');
    });

    it('리전이 포함된 S3 URL에서도 키를 정확하게 추출한다', () => {
      const url =
        'https://bucket.s3.ap-northeast-2.amazonaws.com/path/to/file.pdf';

      const key = (service as any).extractKeyFromUrl(url);

      expect(key).toBe('path/to/file.pdf');
    });

    it('잘못된 URL인 경우 에러를 발생시켜야 한다', () => {
      const url = 'not-a-valid-url';

      expect(() => (service as any).extractKeyFromUrl(url)).toThrow(
        '파일 키 추출 실패',
      );
    });
  });

  describe('열람용 Presigned URL 생성 (getPresignedUrl)', () => {
    const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';
    const mockSignedUrl = 'https://signed-url.com';

    it('CloudFront 설정이 있으면 CloudFront Signed URL을 생성한다', async () => {
      // 준비
      (getCloudFrontSignedUrl as jest.Mock).mockReturnValue(mockSignedUrl);

      // 실행
      const result = await service.getPresignedUrl(fileUrl);

      // 검증
      expect(result).toBe(mockSignedUrl);
      expect(getCloudFrontSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('materials/test.pdf'),
          keyPairId: 'test-key-pair-id',
          privateKey: 'test-private-key',
        }),
      );
    });

    it('CloudFront 설정이 없거나 실패하면 S3 Presigned URL을 생성한다', async () => {
      // 준비
      (config as any).AWS_CLOUDFRONT_KEY_PAIR_ID = '';
      (getS3SignedUrl as jest.Mock).mockResolvedValue(mockSignedUrl);

      // 실행
      const result = await service.getPresignedUrl(fileUrl);

      // 검증
      expect(result).toBe(mockSignedUrl);
      expect(getS3SignedUrl).toHaveBeenCalled();
    });
  });

  describe('다운로드용 Presigned URL 생성 (getDownloadPresignedUrl)', () => {
    const fileUrl = 'https://d123.cloudfront.net/materials/test.pdf';
    const fileName = '한글 파일.pdf';
    const mockDownloadUrl = 'https://signed-download-url.com';

    it('CloudFront 설정이 있으면 Content-Disposition이 포함된 CloudFront Signed URL을 생성한다', async () => {
      // 준비
      (getCloudFrontSignedUrl as jest.Mock).mockReturnValue(mockDownloadUrl);

      // 실행
      const result = await service.getDownloadPresignedUrl(fileUrl, fileName);

      // 검증
      expect(result).toBe(mockDownloadUrl);
      const calledArgs = (getCloudFrontSignedUrl as jest.Mock).mock.calls[0][0];
      expect(calledArgs.url).toContain('response-content-disposition=');
      expect(calledArgs.url).toContain(
        encodeURIComponent('attachment; filename='),
      );
    });

    it('CloudFront 설정이 없거나 실패하면 ResponseContentDisposition이 포함된 S3 Presigned URL을 생성한다', async () => {
      // 준비
      (config as any).AWS_CLOUDFRONT_KEY_PAIR_ID = '';
      (getS3SignedUrl as jest.Mock).mockResolvedValue(mockDownloadUrl);

      // 실행
      const result = await service.getDownloadPresignedUrl(fileUrl, fileName);

      // 검증
      expect(result).toBe(mockDownloadUrl);
      const calledArgs = (getS3SignedUrl as jest.Mock).mock.calls[0];
      const command = calledArgs[1];
      expect(command.input.ResponseContentDisposition).toContain('attachment;');
      expect(command.input.ResponseContentDisposition).toContain(
        encodeURIComponent(fileName),
      );
    });
  });
});
