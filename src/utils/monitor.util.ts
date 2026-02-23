import os from 'node:os';
import {
  config,
  isDevelopment,
  isProduction,
  isTest,
} from '../config/env.config.js';

/**
 * 전송할 지표 인터페이스
 */
interface SystemMetrics {
  type: 'SYSTEM_METRIC';
  cpuLoad: number;
  memoryUsage: string;
  uptime: number;
  timestamp: string;
  isAlert?: boolean;
}

/** 알람 환경 설정 */
let lastAlertTime = 0; // 마지막 알림 발송 시각 (쿨다운 계산용)
/** 알람 환경 설정 상수 */
const ALERT_COOLDOWN = 300000; // 5분
const ALARM_THRESHOLD = isDevelopment() || isTest() ? 100 : 80;
const LAMBDA_FETCH_TIMEOUT_MS = 10000; // 10 초 postToLambda 무한대기 방지

/** 전송 로직 */
const postToLambda = async (data: object) => {
  if (!isProduction() || !config.ALARM_LAMBDA_URL) return;

  try {
    const response = await fetch(`${config.ALARM_LAMBDA_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.INTERNAL_INGEST_SECRET && {
          'x-internal-secret': config.INTERNAL_INGEST_SECRET,
        }),
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(LAMBDA_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[Monitor] Lambda 전송 실패 (Status: ${response.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('[Monitor] Lambda 요청 타임아웃');
    } else {
      console.error('[Monitor] Lambda 네트워크 에러:', error);
    }
  }
};

/**시스템 지표를 추출하여 Lambda 엔드포인트로 전송합니다.*/
export const sendSystemMetrics = async () => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usageNum = totalMem > 0 ? ((totalMem - freeMem) / totalMem) * 100 : 0;
    const now = Date.now();

    /** 대시보드용 기본 지표 설정 */
    const metrics: SystemMetrics = {
      type: 'SYSTEM_METRIC',
      cpuLoad: os.loadavg()[0],
      memoryUsage: usageNum.toFixed(2),
      uptime: os.uptime(),
      timestamp: new Date().toISOString(),
    };

    /** 임계치 체크 및 알람 플래그 설정 */
    if (usageNum >= ALARM_THRESHOLD && now - lastAlertTime >= ALERT_COOLDOWN) {
      metrics.isAlert = true; //람다에게 알람도 쏘라고 알려준다.
      lastAlertTime = now;
      console.log(`[Monitor] 임계치 초과 알람 생성: ${metrics.memoryUsage}%`);
    }

    /** 람다로 전송 (DB 저장 + 조건부 알람) */
    await postToLambda(metrics);
  } catch (error) {
    console.error('[Monitor] 지표 수집 중 에러:', error);
  }
};

let monitoringInterval: NodeJS.Timeout | null = null;

/** 모니터링 주기를 시작합니다. */
export const startSystemMonitoring = (intervalMs: number = 60000) => {
  if (!isProduction() || monitoringInterval) return;

  // 최초 즉시 실행
  sendSystemMetrics();

  // 주기적 실행
  monitoringInterval = setInterval(sendSystemMetrics, intervalMs);
};

/** 모니터링 주기를 중단합니다. */
export const stopSystemMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
};
