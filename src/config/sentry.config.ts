import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config, isProduction } from './env.config.js';

export const initSentry = () => {
  if (!isProduction()) return;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    // 추후 트레이스 기능이 아주 절실할 때 올려주세
    tracesSampleRate: 0.01,
    environment: config.ENVIRONMENT,
  });
};
