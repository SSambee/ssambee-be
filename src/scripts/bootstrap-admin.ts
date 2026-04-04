import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { v7 as uuidv7 } from 'uuid';
import { prisma } from '../config/db.config.js';
import { config } from '../config/env.config.js';
import { AdminProfileStatus, UserType } from '../constants/auth.constant.js';

export const bootstrapPrimaryAdmin = async ({
  email,
  name = 'Ops Admin',
  allowBootstrap = config.ALLOW_ADMIN_BOOTSTRAP === 'true',
  now = new Date(),
}: {
  email: string;
  name?: string;
  allowBootstrap?: boolean;
  now?: Date;
}) => {
  if (!allowBootstrap) {
    throw new Error(
      'ALLOW_ADMIN_BOOTSTRAP=true 환경변수가 설정된 경우에만 실행할 수 있습니다.',
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('이메일은 필수입니다.');
  }

  return prisma.$transaction(async (tx) => {
    const [adminUserCount, adminCount] = await Promise.all([
      tx.user.count({
        where: { userType: UserType.ADMIN },
      }),
      tx.admin.count(),
    ]);

    if (adminUserCount > 0 || adminCount > 0) {
      throw new Error('이미 관리자 계정이 존재합니다.');
    }

    const user = await tx.user.create({
      data: {
        id: uuidv7(),
        email: normalizedEmail,
        name,
        userType: UserType.ADMIN,
        role: 'admin',
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    await tx.admin.create({
      data: {
        id: uuidv7(),
        userId: user.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    return user;
  });
};

const run = async () => {
  const [email, name = 'Ops Admin'] = process.argv.slice(2);

  if (!email) {
    console.error('usage: pnpm bootstrap:admin <email> [name]');
    process.exit(1);
  }

  try {
    const result = await bootstrapPrimaryAdmin({ email, name });

    console.log(
      JSON.stringify(
        {
          id: result.id,
          email: result.email,
          name: result.name,
          nextStep:
            '관리자 페이지에서 이메일 OTP 인증 후 비밀번호를 설정하세요.',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      'admin bootstrap failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void run();
}
