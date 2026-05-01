import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg'; // Assuming this is the correct import path
import { config, isDevelopment, isProduction } from './env.config.js';
import fs from 'fs';

const getPrismaLogLevel = () => {
  if (!isDevelopment()) {
    return ['warn', 'error'] as Prisma.LogLevel[];
  }
  //개발 환경에서만 추가 로깅 개방
  return ['query', 'info', 'warn', 'error'] as Prisma.LogLevel[];
};

const getSslConfig = () => {
  if (!isProduction()) {
    return undefined;
  }

  const caPath = '/certs/global-bundle.pem';
  if (!fs.existsSync(caPath)) {
    console.warn(
      `[DB] CA bundle not found at ${caPath}. Falling back to the system CA store.`,
    );
    return { rejectUnauthorized: true };
  }

  return {
    rejectUnauthorized: true,
    ca: fs.readFileSync(caPath, 'utf8'),
  };
};

const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  ssl: getSslConfig(),
});

export const prisma = new PrismaClient({
  adapter,
  log: getPrismaLogLevel(),
});

export async function disconnectDB(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('📦 Disconnected from the database.');
  } catch (e) {
    console.error('❌ Error disconnecting from the database:', e);
    process.exit(1);
  }
}
