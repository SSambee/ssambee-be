import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  ENVIRONMENT: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1000).max(65535),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  FRONT_URL: z.string(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  SENTRY_DSN: z.string(),
  AWS_REGION: z.string().default('ap-northeast-2'),
  AWS_S3_BUCKET_DOCUMENTS: z.string().default('ssambee-dev-lms-documents'),
  AWS_S3_BUCKET_REPORTS: z.string().default('ssambee-dev-lms-reports'),
  AWS_CLOUDFRONT_URL_DOCUMENTS: z.string().default(''),
  AWS_CLOUDFRONT_URL_REPORTS: z.string().default(''),
  AWS_CLOUDFRONT_KEY_PAIR_ID: z.string().default(''),
  AWS_CLOUDFRONT_PRIVATE_KEY: z.string().optional().default(''),
});

const parseEnvironment = () => {
  try {
    return envSchema.parse({
      ENVIRONMENT: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL,
      FRONT_URL: process.env.FRONT_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      SENTRY_DSN: process.env.SENTRY_DSN,
      AWS_REGION: process.env.AWS_REGION,
      AWS_S3_BUCKET_DOCUMENTS: process.env.AWS_S3_BUCKET_DOCUMENTS,
      AWS_S3_BUCKET_REPORTS: process.env.AWS_S3_BUCKET_REPORTS,
      AWS_CLOUDFRONT_URL_DOCUMENTS: process.env.AWS_CLOUDFRONT_URL_DOCUMENTS,
      AWS_CLOUDFRONT_URL_REPORTS: process.env.AWS_CLOUDFRONT_URL_REPORTS,
      AWS_CLOUDFRONT_KEY_PAIR_ID: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID,
      AWS_CLOUDFRONT_PRIVATE_KEY: process.env.AWS_CLOUDFRONT_PRIVATE_KEY,
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
export const isProduction = () => config.ENVIRONMENT === 'production';
export const isTest = () => config.ENVIRONMENT === 'test';
