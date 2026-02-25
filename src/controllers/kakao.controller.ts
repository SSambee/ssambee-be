import { Request, Response, NextFunction } from 'express';
import {
  getKakaoAccessToken,
  saveKakaoToken,
  sendKakaoMemo,
} from '../services/kakao.service.js';
import { config } from '../config/env.config.js';
import { successResponse } from '../utils/response.util.js';

export class KakaoController {
  /** 카카오 로그인 URL 리다이렉트 */
  redirectToKakaoAuth = (_req: Request, res: Response) => {
    if (!config.KAKAO_REST_API_KEY || !config.KAKAO_REDIRECT_URI) {
      res.status(500).json({ message: '카카오 설정이 누락되었습니다.' });
      return;
    }

    const authUrl =
      'https://kauth.kakao.com/oauth/authorize' +
      `?client_id=${config.KAKAO_REST_API_KEY}` +
      `&redirect_uri=${encodeURIComponent(config.KAKAO_REDIRECT_URI)}` +
      '&response_type=code' +
      '&scope=talk_message';

    res.redirect(authUrl);
  };

  /** 인가 코드 수신 → 토큰 저장 */
  handleKakaoCallback = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { code } = req.query as { code?: string };
      if (!code) {
        res.status(400).json({ message: '인가 코드가 없습니다.' });
        return;
      }

      const tokenData = await getKakaoAccessToken(code);
      await saveKakaoToken(
        tokenData.access_token,
        tokenData.refresh_token ?? '',
      );

      return successResponse(res, {
        data: { message: '카카오 토큰 저장 완료' },
        message: '카카오 로그인 성공. 이제 나에게 보내기를 사용할 수 있습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 나에게 보내기 */
  sendMemo = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description, imageUrl, webUrl, buttonTitle } =
        req.body as {
          title: string;
          description: string;
          imageUrl?: string;
          webUrl: string;
          buttonTitle?: string;
        };

      if (!title || !description || !webUrl) {
        res
          .status(400)
          .json({ message: 'title, description, webUrl은 필수입니다.' });
        return;
      }

      await sendKakaoMemo({
        title,
        description,
        imageUrl,
        webUrl,
        buttonTitle,
      });

      return successResponse(res, {
        data: { sent: true },
        message: '카카오톡 나에게 보내기 완료.',
      });
    } catch (error) {
      next(error);
    }
  };
}
