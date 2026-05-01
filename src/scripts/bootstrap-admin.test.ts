jest.mock('../config/db.config.js', () => ({
  prisma: {
    user: {
      count: jest.fn(),
      create: jest.fn(),
    },
    admin: {
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

jest.mock('../config/env.config.js', () => ({
  config: {
    ALLOW_ADMIN_BOOTSTRAP: 'true',
  },
}));

import { bootstrapPrimaryAdmin } from './bootstrap-admin.js';
import { prisma } from '../config/db.config.js';
import { AdminProfileStatus, UserType } from '../constants/auth.constant.js';

const mockPrisma = prisma as unknown as {
  user: {
    count: jest.Mock;
    create: jest.Mock;
  };
  admin: {
    count: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
  $disconnect: jest.Mock;
};

describe('bootstrap-admin - @unit #critical', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );
  });

  it('기존 admin user 또는 admin row가 있으면 실패한다', async () => {
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.admin.count.mockResolvedValue(0);

    await expect(
      bootstrapPrimaryAdmin({
        email: 'primary-admin@example.com',
      }),
    ).rejects.toThrow('이미 관리자 계정이 존재합니다.');
  });

  it('zero-admin 상태에서 pending primary admin user와 admin row를 생성한다', async () => {
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.admin.count.mockResolvedValue(0);
    mockPrisma.user.create.mockResolvedValue({
      id: 'primary-admin-user-id',
      email: 'primary-admin@example.com',
      name: 'Ops Admin',
    });
    mockPrisma.admin.create.mockResolvedValue({
      id: 'primary-admin-row-id',
    });

    const result = await bootstrapPrimaryAdmin({
      email: 'primary-admin@example.com',
      now: new Date('2026-04-03T00:00:00.000Z'),
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'primary-admin@example.com',
        userType: UserType.ADMIN,
        role: 'admin',
        emailVerified: false,
      }),
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    expect(mockPrisma.admin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'primary-admin-user-id',
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
      }),
    });
    expect(result).toEqual({
      id: 'primary-admin-user-id',
      email: 'primary-admin@example.com',
      name: 'Ops Admin',
    });
  });

  it('env gate가 꺼져 있으면 실행할 수 없다', async () => {
    await expect(
      bootstrapPrimaryAdmin({
        email: 'primary-admin@example.com',
        allowBootstrap: false,
      }),
    ).rejects.toThrow(
      'ALLOW_ADMIN_BOOTSTRAP=true 환경변수가 설정된 경우에만 실행할 수 있습니다.',
    );
  });
});
