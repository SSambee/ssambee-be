import { StreamOptions } from 'morgan';
import { config, isProduction } from '../config/env.config.js';

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
  message: string;
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
    if (!isProduction() || !config.MONITOR_LAMBDA_URL) {
      return;
    }

    const url = `${config.MONITOR_LAMBDA_URL}/ingest`;
    const apiKey = config.INTERNAL_INGEST_SECRET; // 인가 처리를 위한 시크릿

    const trimmedMessage = message.trim();

    // 상태 코드를 파싱하여 로그 레벨 결정 (예: "GET /api 200 ..." -> 200)
    // Morgan 포맷에 따라 다를 수 있지만 일반적으로 상태 코드는 숫자 3자리입니다.
    let level: LogLevel = LOG_LEVEL.INFO;
    const statusMatch = trimmedMessage.match(/\s(\d{3})(?:\s|$)/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1], 10);
      if (statusCode >= 500) {
        level = LOG_LEVEL.ERROR;
      } else if (statusCode >= 400) {
        level = LOG_LEVEL.INFO;
      }
    }

    const payload: LogPayload = {
      message: trimmedMessage,
      timestamp: new Date().toISOString(),
      level: level,
    };

    const envelope = {
      logs: [payload],
    };

    // 비동기 비차단(Non-blocking) 방식으로 전송
    // 요청의 완료를 기다리지 않고 백그라운드에서 실행되도록 합니다.
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'x-internal-secret': apiKey }),
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(5000),
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
