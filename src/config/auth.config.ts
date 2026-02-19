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
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationLinkMail({
        email: user.email,
        url,
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
  },

  trustedOrigins: config.FRONT_URL ? config.FRONT_URL.split(',') : [],
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
