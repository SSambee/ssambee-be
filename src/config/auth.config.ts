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
import {
  config,
  isDevelopment,
  isProduction,
  isStaging,
} from './env.config.js';
import { SIGNUP_PENDING_USER_TYPE } from '../constants/auth.constant.js';
import { sendEmailOtp, sendVerificationLinkMail } from '../utils/mail.util.js';
import { getDomain } from 'tldts';
import {
  getConfiguredFrontendOrigins,
  getDevelopmentTrustedOrigins,
} from '../utils/origin.util.js';

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

const configuredTrustedOrigins = getConfiguredFrontendOrigins({
  frontUrl: config.FRONT_URL,
  adminFrontUrl: config.ADMIN_FRONT_URL,
});

const toSharedCookieDomain = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const domain = getDomain(value.trim().toLowerCase());
  if (!domain) {
    return undefined;
  }

  return `.${domain}`;
};

const crossDomainCookieDomain = isProduction()
  ? toSharedCookieDomain(
      config.AUTH_COOKIE_DOMAIN || config.BETTER_AUTH_URL || 'http://localhost',
    )
  : undefined;

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
    ...(isStaging()
      ? {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
          },
        }
      : {}),
    crossSubDomainCookies: {
      ...(crossDomainCookieDomain
        ? {
            enabled: true,
            domain: crossDomainCookieDomain,
          }
        : {
            enabled: false,
          }),
    },
  },

  trustedOrigins: async (request) => {
    if (!isDevelopment() || !request) {
      return configuredTrustedOrigins;
    }

    return Array.from(
      new Set([
        ...configuredTrustedOrigins,
        ...getDevelopmentTrustedOrigins(request),
      ]),
    );
  },
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
