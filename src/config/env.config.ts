import dotenv from 'dotenv';
import { z } from 'zod';
import { loadSecrets } from './secrets.js';

dotenv.config();

const envBoolean = z.union([z.boolean(), z.stringbool()]);

/**
 * 개발 환경일때 먼저 SSM 시크릿을 로드 로컬에 이미 있으면 스킵
 * 없으면 SSM에서 가져와 process.env에 박아줌
 */
if (process.env.NODE_ENV !== 'test') {
  await loadSecrets();
}

const envSchema = z.object({
  ENVIRONMENT: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1000).max(65535),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  FRONT_URL: z.string(),
  ADMIN_FRONT_URL: z.string().optional(),
  BANK_TRANSFER_ACCOUNT_BANK: z.string().default(''),
  BANK_TRANSFER_ACCOUNT_NUMBER: z.string().default(''),
  BANK_TRANSFER_ACCOUNT_HOLDER: z.string().default(''),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  ALLOW_ADMIN_BOOTSTRAP: z.string().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  SENTRY_DSN: z.string(),
  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_S3_BUCKET_DOCUMENTS: z.string().default('ssambee-dev-lms-documents'),
  AWS_S3_BUCKET_REPORTS: z.string().default('ssambee-dev-lms-reports'),
  AWS_CLOUDFRONT_URL_DOCUMENTS: z.string().default(''),
  AWS_CLOUDFRONT_URL_REPORTS: z.string().default(''),
  AWS_CLOUDFRONT_KEY_PAIR_ID: z.string().default(''),
  AWS_CLOUDFRONT_PRIVATE_KEY: z.string().optional().default(''),
  REDIS_URL: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: envBoolean.optional(),
  SCHEDULER_ENABLED: envBoolean.default(true),
  SCHEDULER_POLL_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(15),
  SCHEDULER_JOB_FILTER: z.string().optional(),
  BILLING_RECONCILE_CRON: z.string().default('5 0 * * *'),
  BILLING_RECONCILE_TIMEZONE: z.string().default('Asia/Seoul'),
  KAKAO_REST_API_KEY: z.string().optional(),
  KAKAO_REDIRECT_URI: z.string().optional(),
  KAKAO_CLIENT_SECRET: z.string().optional(),
  GRAFANA_CLOUD_URL: z.string().optional(),
  GRAFANA_CLOUD_USERNAME: z.string().optional(),
  GRAFANA_CLOUD_API_KEY: z.string().optional(),
});

const parseEnvironment = () => {
  try {
    // process.env에는 로컬 .env의 값 혹은 SSM에서 가져온 값이 들어갑니다.
    return envSchema.parse({
      ENVIRONMENT: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL,
      FRONT_URL: process.env.FRONT_URL,
      ADMIN_FRONT_URL: process.env.ADMIN_FRONT_URL,
      BANK_TRANSFER_ACCOUNT_BANK: process.env.BANK_TRANSFER_ACCOUNT_BANK,
      BANK_TRANSFER_ACCOUNT_NUMBER: process.env.BANK_TRANSFER_ACCOUNT_NUMBER,
      BANK_TRANSFER_ACCOUNT_HOLDER: process.env.BANK_TRANSFER_ACCOUNT_HOLDER,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      ALLOW_ADMIN_BOOTSTRAP: process.env.ALLOW_ADMIN_BOOTSTRAP,
      AUTH_COOKIE_DOMAIN: process.env.AUTH_COOKIE_DOMAIN,
      SENTRY_DSN: process.env.SENTRY_DSN,
      AWS_REGION: process.env.AWS_REGION,
      AWS_S3_BUCKET_DOCUMENTS: process.env.AWS_S3_BUCKET_DOCUMENTS,
      AWS_S3_BUCKET_REPORTS: process.env.AWS_S3_BUCKET_REPORTS,
      AWS_CLOUDFRONT_URL_DOCUMENTS: process.env.AWS_CLOUDFRONT_URL_DOCUMENTS,
      AWS_CLOUDFRONT_URL_REPORTS: process.env.AWS_CLOUDFRONT_URL_REPORTS,
      AWS_CLOUDFRONT_KEY_PAIR_ID: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID,
      AWS_CLOUDFRONT_PRIVATE_KEY: process.env.AWS_CLOUDFRONT_PRIVATE_KEY,
      REDIS_URL: process.env.REDIS_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_FROM: process.env.SMTP_FROM,
      SMTP_SECURE: process.env.SMTP_SECURE,
      SCHEDULER_ENABLED: process.env.SCHEDULER_ENABLED,
      SCHEDULER_POLL_INTERVAL_SECONDS:
        process.env.SCHEDULER_POLL_INTERVAL_SECONDS,
      SCHEDULER_JOB_FILTER: process.env.SCHEDULER_JOB_FILTER,
      BILLING_RECONCILE_CRON: process.env.BILLING_RECONCILE_CRON,
      BILLING_RECONCILE_TIMEZONE: process.env.BILLING_RECONCILE_TIMEZONE,
      KAKAO_REST_API_KEY: process.env.KAKAO_REST_API_KEY,
      KAKAO_REDIRECT_URI: process.env.KAKAO_REDIRECT_URI,
      KAKAO_CLIENT_SECRET: process.env.KAKAO_CLIENT_SECRET,
      GRAFANA_CLOUD_URL: process.env.GRAFANA_CLOUD_URL,
      GRAFANA_CLOUD_USERNAME: process.env.GRAFANA_CLOUD_USERNAME,
      GRAFANA_CLOUD_API_KEY: process.env.GRAFANA_CLOUD_API_KEY,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.log('error.errors', err);
    }
    process.exit(1);
  }
};

export const config = parseEnvironment();

export const isDevelopment = () => config.ENVIRONMENT === 'development';
export const isStaging = () => config.ENVIRONMENT === 'staging';
export const isProduction = () => config.ENVIRONMENT === 'production';
export const isTest = () => config.ENVIRONMENT === 'test';
