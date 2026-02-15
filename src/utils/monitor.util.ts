import os from 'node:os';
import { config, isTest } from '../config/env.config.js';

/**
 * 전송할 지표 인터페이스
 */
interface SystemMetrics {
  type: 'SYSTEM_METRIC';
  cpuLoad: number;
  memoryUsage: string;
  uptime: number;
  timestamp: string;
}

/**
 * 시스템 지표를 추출하여 Lambda 엔드포인트로 전송합니다.
 */
export const sendSystemMetrics = async () => {
  // 테스트 환경이거나 Lambda URL이 없으면 전송하지 않음
  if (isTest() || !config.LAMBDA_URL) {
    return;
  }

  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usage = ((totalMem - freeMem) / totalMem) * 100;

    const metrics: SystemMetrics = {
      type: 'SYSTEM_METRIC',
      cpuLoad: os.loadavg()[0], // 1분 평균 부하
      memoryUsage: usage.toFixed(2),
      uptime: os.uptime(),
      timestamp: new Date().toISOString(),
    };

    // 비동기 fetch (Fire and Forget)
    fetch(config.LAMBDA_URL, {
      method: 'POST',
      body: JSON.stringify(metrics),
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      // 서버 로그에는 남기되, 서버 프로세스에 영향을 주지 않도록 함
      console.error('[Monitor] Failed to send metrics:', err);
    });
  } catch (error) {
    console.error('[Monitor] Error gathering metrics:', error);
  }
};

let monitoringInterval: NodeJS.Timeout | null = null;

/**
 * 모니터링 주기를 시작합니다.
 */
export const startSystemMonitoring = (intervalMs: number = 60000) => {
  if (isTest() || monitoringInterval) return;

  // 최초 즉시 실행
  sendSystemMetrics();

  // 주기적 실행
  monitoringInterval = setInterval(() => {
    sendSystemMetrics();
  }, intervalMs);
};

/**
 * 모니터링 주기를 중단합니다.
 */
export const stopSystemMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
};
