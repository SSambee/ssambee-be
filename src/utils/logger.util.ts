import { StreamOptions } from 'morgan';
import { config } from '../config/env.config.js';

/**
 * 로그 레벨 정의 (Enum 대신 Const Object와 Union Type 사용)
 */
export const LOG_LEVEL = {
  INFO: 'info',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LOG_LEVEL)[keyof typeof LOG_LEVEL];

/**
 * Lambda로 전송할 로그 데이터 구조
 */
export interface LogPayload {
  log: string;
  timestamp: string;
  level: LogLevel;
}

/**
 * Morgan 로그를 AWS Lambda로 비동기 전송하는 커스텀 스트림
 */
export class MorganLambdaStream implements StreamOptions {
  /**
   * Morgan에서 호출되는 write 함수
   * @param message Morgan 포맷에 따라 생성된 로그 문자열
   */
  write(message: string): void {
    const url = config.LOG_LAMBDA_URL;
    const apiKey = config.LOG_LAMBDA_API_KEY;

    // URL이 설정되어 있지 않으면 로깅을 스킵합니다.
    if (!url) {
      return;
    }

    const payload: LogPayload = {
      log: message.trim(),
      timestamp: new Date().toISOString(),
      level: LOG_LEVEL.INFO,
    };

    // 비동기 비차단(Non-blocking) 방식으로 전송
    // 요청의 완료를 기다리지 않고 백그라운드에서 실행되도록 합니다.
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-api-key': apiKey }),
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          console.error(
            `[MorganLambdaStream] Lambda responded with status ${res.status}`,
          );
        }
      })
      .catch((error) => {
        console.error(
          '[MorganLambdaStream] Failed to send log to Lambda:',
          error,
        );
      });
  }
}
