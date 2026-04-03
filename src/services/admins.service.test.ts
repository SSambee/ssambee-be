jest.mock('../utils/mail.util.js', () => ({
  sendAdminInvitationMail: jest.fn(),
}));

import { AdminsService } from './admins.service.js';
import { AdminProfileStatus, UserType } from '../constants/auth.constant.js';
import {
  ConflictException,
  ForbiddenException,
} from '../err/http.exception.js';
import {
  createMockAdminRepository,
  createMockPrisma,
} from '../test/mocks/index.js';
import { sendAdminInvitationMail } from '../utils/mail.util.js';
import type { PrismaClient, Prisma } from '../generated/prisma/client.js';

describe('AdminsService - @unit #critical', () => {
  let adminsService: AdminsService;
  let mockAdminRepo: ReturnType<typeof createMockAdminRepository>;
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdminRepo = createMockAdminRepository();
    mockPrisma = createMockPrisma() as unknown as jest.Mocked<PrismaClient>;
    mockPrisma.$transaction.mockImplementation(
      <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) =>
        callback(mockPrisma as unknown as Prisma.TransactionClient),
    );

    adminsService = new AdminsService(mockAdminRepo, mockPrisma);
  });

  it('primary active admin은 새 pending admin을 초대할 수 있다', async () => {
    mockAdminRepo.findByUserId.mockResolvedValue({
      id: 'admin-row-id',
      userId: 'primary-admin-user-id',
      status: AdminProfileStatus.ACTIVE,
      isPrimaryAdmin: true,
      invitedByUserId: null,
      invitedAt: new Date(),
      activatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ name: '최초 관리자' } as never)
      .mockResolvedValueOnce(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-admin-user-id',
      email: 'new-admin@example.com',
      name: '추가 관리자',
    } as never);
    mockPrisma.admin.create.mockResolvedValue({
      id: 'new-admin-row-id',
    } as never);
    (sendAdminInvitationMail as jest.Mock).mockResolvedValue(undefined);

    const result = await adminsService.inviteAdmin('primary-admin-user-id', {
      email: 'new-admin@example.com',
      name: '추가 관리자',
    });

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'new-admin@example.com',
        name: '추가 관리자',
        userType: UserType.ADMIN,
        role: 'admin',
      }),
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
    expect(mockPrisma.admin.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'new-admin-user-id',
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: false,
        invitedByUserId: 'primary-admin-user-id',
      }),
    });
    expect(sendAdminInvitationMail).toHaveBeenCalledWith({
      email: 'new-admin@example.com',
      invitedByName: '최초 관리자',
    });
    expect(result).toEqual({
      id: 'new-admin-user-id',
      email: 'new-admin@example.com',
      name: '추가 관리자',
      resent: false,
    });
  });

  it('primary admin이 같은 pending admin 이메일을 다시 초대하면 재발송 처리한다', async () => {
    mockAdminRepo.findByUserId
      .mockResolvedValueOnce({
        id: 'actor-admin-row-id',
        userId: 'primary-admin-user-id',
        status: AdminProfileStatus.ACTIVE,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'pending-admin-row-id',
        userId: 'pending-admin-user-id',
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: false,
        invitedByUserId: 'primary-admin-user-id',
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ name: '최초 관리자' } as never)
      .mockResolvedValueOnce({
        id: 'pending-admin-user-id',
        email: 'pending-admin@example.com',
        userType: UserType.ADMIN,
      } as never);
    mockPrisma.user.update.mockResolvedValue({
      id: 'pending-admin-user-id',
      email: 'pending-admin@example.com',
      name: '추가 관리자',
    } as never);
    (sendAdminInvitationMail as jest.Mock).mockResolvedValue(undefined);

    const result = await adminsService.inviteAdmin('primary-admin-user-id', {
      email: 'pending-admin@example.com',
      name: '추가 관리자',
    });

    expect(mockAdminRepo.updateByUserId).toHaveBeenCalledWith(
      'pending-admin-user-id',
      expect.objectContaining({
        invitedByUserId: 'primary-admin-user-id',
        invitedAt: expect.any(Date),
      }),
    );
    expect(result.resent).toBe(true);
  });

  it('primary admin이 아니면 초대할 수 없다', async () => {
    mockAdminRepo.findByUserId.mockResolvedValue({
      id: 'secondary-admin-row-id',
      userId: 'secondary-admin-user-id',
      status: AdminProfileStatus.ACTIVE,
      isPrimaryAdmin: false,
      invitedByUserId: null,
      invitedAt: new Date(),
      activatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      adminsService.inviteAdmin('secondary-admin-user-id', {
        email: 'new-admin@example.com',
        name: '추가 관리자',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('이미 활성화된 관리자 이메일은 초대할 수 없다', async () => {
    mockAdminRepo.findByUserId
      .mockResolvedValueOnce({
        id: 'actor-admin-row-id',
        userId: 'primary-admin-user-id',
        status: AdminProfileStatus.ACTIVE,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'existing-admin-row-id',
        userId: 'existing-admin-user-id',
        status: AdminProfileStatus.ACTIVE,
        isPrimaryAdmin: false,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ name: '최초 관리자' } as never)
      .mockResolvedValueOnce({
        id: 'existing-admin-user-id',
        email: 'existing-admin@example.com',
        userType: UserType.ADMIN,
      } as never);

    await expect(
      adminsService.inviteAdmin('primary-admin-user-id', {
        email: 'existing-admin@example.com',
        name: '이미 활성화된 관리자',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
