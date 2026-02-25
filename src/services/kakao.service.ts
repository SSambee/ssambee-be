import { redis } from '../config/redis.config.js';
import { config } from '../config/env.config.js';

const KAKAO_TOKEN_KEY = 'kakao:token';
const KAKAO_TOKEN_TTL = 60 * 60 * 24 * 30; // 30일

type KakaoTokenResponse = {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
};

type KakaoStoredToken = {
  accessToken: string;
  refreshToken: string;
};

export type KakaoMemoPayload = {
  title: string; // max 200자
  description: string; // max 200자
  imageUrl?: string; // S3 URL
  webUrl: string;
  buttonTitle?: string;
};

const trimByCodePoints = (value: string, maxLength: number): string =>
  Array.from(value).slice(0, maxLength).join('');

const kakaoPost = async <T>(
  url: string,
  params: URLSearchParams,
  accessToken?: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: params.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`카카오 API 오류 [${response.status}]: ${text}`);
  }

  return response.json() as Promise<T>;
};

/** 인가 코드 → 액세스 토큰 교환 */
export const getKakaoAccessToken = async (
  code: string,
): Promise<KakaoTokenResponse> => {
  if (!config.KAKAO_REST_API_KEY || !config.KAKAO_REDIRECT_URI) {
    throw new Error(
      'KAKAO_REST_API_KEY 또는 KAKAO_REDIRECT_URI가 설정되지 않았습니다.',
    );
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.KAKAO_REST_API_KEY,
    redirect_uri: config.KAKAO_REDIRECT_URI,
    code,
  });

  // 클라이언트 시크릿 활성화된 경우 포함
  if (config.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', config.KAKAO_CLIENT_SECRET);
  }

  return kakaoPost<KakaoTokenResponse>(
    'https://kauth.kakao.com/oauth/token',
    params,
  );
};

/** 토큰 저장 (Redis) */
export const saveKakaoToken = async (
  accessToken: string,
  refreshToken: string,
): Promise<void> => {
  const stored: KakaoStoredToken = { accessToken, refreshToken };
  await redis.set(
    KAKAO_TOKEN_KEY,
    JSON.stringify(stored),
    'EX',
    KAKAO_TOKEN_TTL,
  );
};

/** 토큰 조회 (Redis) */
export const getKakaoToken = async (): Promise<KakaoStoredToken | null> => {
  const raw = await redis.get(KAKAO_TOKEN_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as KakaoStoredToken;
};

/** 액세스 토큰 갱신 */
const refreshKakaoToken = async (refreshToken: string): Promise<string> => {
  if (!config.KAKAO_REST_API_KEY) {
    throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.KAKAO_REST_API_KEY,
    refresh_token: refreshToken,
  });

  // 클라이언트 시크릿 활성화된 경우 포함
  if (config.KAKAO_CLIENT_SECRET) {
    params.set('client_secret', config.KAKAO_CLIENT_SECRET);
  }

  const data = await kakaoPost<KakaoTokenResponse>(
    'https://kauth.kakao.com/oauth/token',
    params,
  );

  const newRefreshToken = data.refresh_token ?? refreshToken;
  await saveKakaoToken(data.access_token, newRefreshToken);

  return data.access_token;
};

const isUnauthorizedError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.includes('[401]');
  }
  return false;
};

/** 나에게 보내기 (토큰 만료 시 자동 갱신) */
export const sendKakaoMemo = async (
  payload: KakaoMemoPayload,
): Promise<void> => {
  const stored = await getKakaoToken();
  if (!stored) {
    throw new Error(
      '카카오 토큰이 없습니다. /api/kakao/auth 로 먼저 로그인하세요.',
    );
  }

  const buildParams = (): URLSearchParams => {
    const templateObject: Record<string, unknown> = {
      object_type: 'feed',
      content: {
        title: trimByCodePoints(payload.title, 200),
        description: trimByCodePoints(payload.description, 200),
        link: {
          web_url: payload.webUrl,
          mobile_web_url: payload.webUrl,
        },
        ...(payload.imageUrl && {
          image_url: payload.imageUrl,
          image_width: 800,
          image_height: 400,
        }),
      },
      buttons: [
        {
          title: trimByCodePoints(payload.buttonTitle || '성적표 확인', 200),
          link: {
            web_url: payload.webUrl,
            mobile_web_url: payload.webUrl,
          },
        },
      ],
    };

    return new URLSearchParams({
      template_object: JSON.stringify(templateObject),
    });
  };

  try {
    await kakaoPost(
      'https://kapi.kakao.com/v2/api/talk/memo/default/send',
      buildParams(),
      stored.accessToken,
    );
  } catch (error) {
    // 401 (토큰 만료) 시 자동 갱신 후 재시도
    if (isUnauthorizedError(error)) {
      const newAccessToken = await refreshKakaoToken(stored.refreshToken);
      await kakaoPost(
        'https://kapi.kakao.com/v2/api/talk/memo/default/send',
        buildParams(),
        newAccessToken,
      );
    } else {
      throw error;
    }
  }
};
