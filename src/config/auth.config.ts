import { betterAuth } from 'better-auth';
import { admin, emailOTP } from 'better-auth/plugins';
import {
  ac,
  admin as adminRole,
  user,
  instructor,
} from './auth.permissions.js';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { PrismaClient } from '../generated/prisma/client.js';
import { prisma } from './db.config.js';
import { config, isDevelopment } from './env.config.js';
import { SIGNUP_PENDING_USER_TYPE } from '../constants/auth.constant.js';
import { sendEmailOtp, sendVerificationLinkMail } from '../utils/mail.util.js';

const getVerifyEmailPath = (): string => {
  return '/api/public/v1/auth/verify-email';
};

const buildVerifyEmailLink = (url: string): string => {
  const parsedUrl = new URL(url);
  const token = parsedUrl.searchParams.get('token');

  parsedUrl.pathname = getVerifyEmailPath();
  parsedUrl.search = '';

  if (token) {
    parsedUrl.searchParams.set('token', token);
  }

  return parsedUrl.toString();
};

const trustedOrigins = config.FRONT_URL
  ? Array.from(
      new Set(
        config.FRONT_URL.split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    )
  : [];

export const auth = betterAuth({
  database: prismaAdapter(prisma as unknown as PrismaClient, {
    provider: 'postgresql',
  }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  emailVerification: {
    sendVerificationEmail: async ({ url, user }) => {
      const verifyEmailUrl = buildVerifyEmailLink(url);
      await sendVerificationLinkMail({
        email: user.email,
        url: verifyEmailUrl,
      });
    },
  },

  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
    },
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      userType: {
        type: 'string',
        required: true,
        defaultValue: SIGNUP_PENDING_USER_TYPE,
      },
    },
  },

  modelName: {
    user: 'user',
    session: 'session',
    account: 'account',
    verification: 'verification',
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7일
    updateAge: 60 * 60 * 24, // 1일마다 갱신
    cookieCache: {
      enabled: true, // 필수: getSession이 작동하려면 true여야 함
      maxAge: 60 * 5, // 5분 캐시
    },
  },

  advanced: {
    cookiePrefix: 'ssambee-auth',
    useSecureCookies: !isDevelopment(),
    crossSubDomainCookies: {
      enabled: false,
    },
  },

  trustedOrigins,
  plugins: [
    admin({
      ac: ac,
      roles: {
        admin: adminRole,
        user,
        instructor,
      },
      defaultRole: 'user',
    }),
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendEmailOtp({
          email,
          otp,
          type,
        });
      },
      disableSignUp: false,
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.userType === 'INSTRUCTOR') {
            await prisma.user.update({
              where: { id: user.id },
              data: { role: 'instructor' },
            });
          }
        },
      },
    },
  },
});
