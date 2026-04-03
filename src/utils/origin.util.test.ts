import {
  getAdminPortalBaseUrl,
  getConfiguredFrontendOrigins,
  getDevelopmentTrustedOrigins,
  parseOriginList,
} from './origin.util.js';

describe('origin.util', () => {
  describe('parseOriginList', () => {
    it('유효한 origin만 정규화하고 중복을 제거해야 한다', () => {
      expect(
        parseOriginList(
          'http://localhost:3000, https://admin.example.com/path',
          'http://localhost:3000',
          'invalid-url',
        ),
      ).toEqual(['http://localhost:3000', 'https://admin.example.com']);
    });
  });

  describe('getConfiguredFrontendOrigins', () => {
    it('FRONT_URL과 ADMIN_FRONT_URL을 함께 반환해야 한다', () => {
      expect(
        getConfiguredFrontendOrigins({
          frontUrl: 'http://localhost:3000',
          adminFrontUrl: 'https://admin.example.com',
        }),
      ).toEqual(['http://localhost:3000', 'https://admin.example.com']);
    });
  });

  describe('getAdminPortalBaseUrl', () => {
    it('ADMIN_FRONT_URL을 우선 사용해야 한다', () => {
      expect(
        getAdminPortalBaseUrl({
          frontUrl: 'http://localhost:3000',
          adminFrontUrl: 'https://admin.example.com',
        }),
      ).toBe('https://admin.example.com');
    });
  });

  describe('getDevelopmentTrustedOrigins', () => {
    it('개발 환경에서 localhost와 API host 기반 front origin 후보를 추가해야 한다', () => {
      const request = new Request('http://localhost:4000/api/auth/sign-out', {
        method: 'POST',
        headers: {
          host: 'linn-macbookpro.tailad728e.ts.net:4000',
        },
      });

      expect(getDevelopmentTrustedOrigins(request)).toEqual(
        expect.arrayContaining([
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001',
          'http://linn-macbookpro.tailad728e.ts.net:3000',
          'http://linn-macbookpro.tailad728e.ts.net:3001',
        ]),
      );
    });
  });
});
