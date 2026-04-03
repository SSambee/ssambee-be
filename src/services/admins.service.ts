import { v7 as uuidv7 } from 'uuid';
import { PrismaClient } from '../generated/prisma/client.js';
import { AdminRepository } from '../repos/admin.repo.js';
import { AdminProfileStatus, UserType } from '../constants/auth.constant.js';
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '../err/http.exception.js';
import { sendAdminInvitationMail } from '../utils/mail.util.js';

export class AdminsService {
  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly prisma: PrismaClient,
  ) {}

  private async assertPrimaryAdmin(actorUserId: string) {
    const admin = await this.adminRepo.findByUserId(actorUserId);

    if (
      !admin ||
      admin.status !== AdminProfileStatus.ACTIVE ||
      !admin.isPrimaryAdmin
    ) {
      throw new ForbiddenException(
        '최초 관리자만 추가 관리자 초대를 진행할 수 있습니다.',
      );
    }

    return admin;
  }

  async inviteAdmin(
    actorUserId: string,
    data: {
      email: string;
      name: string;
    },
  ) {
    await this.assertPrimaryAdmin(actorUserId);

    const inviter = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { name: true },
    });
    const normalizedEmail = data.email.trim().toLowerCase();
    const now = new Date();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    let invitedUser:
      | {
          id: string;
          email: string;
          name: string;
        }
      | undefined;
    let resent = false;

    if (existingUser) {
      if (existingUser.userType !== UserType.ADMIN) {
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      }

      const existingAdmin = await this.adminRepo.findByUserId(existingUser.id);

      if (!existingAdmin) {
        throw new ConflictException('이미 사용 중인 이메일입니다.');
      }

      if (existingAdmin.status !== AdminProfileStatus.PENDING_ACTIVATION) {
        throw new ConflictException('이미 활성화된 관리자 계정입니다.');
      }

      invitedUser = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: data.name,
          role: 'admin',
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      await this.adminRepo.updateByUserId(existingUser.id, {
        invitedByUserId: actorUserId,
        invitedAt: now,
      });
      resent = true;
    } else {
      invitedUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: uuidv7(),
            email: normalizedEmail,
            name: data.name,
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
            isPrimaryAdmin: false,
            invitedByUserId: actorUserId,
            invitedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });

        return user;
      });
    }

    try {
      await sendAdminInvitationMail({
        email: normalizedEmail,
        invitedByName: inviter?.name || '운영자',
      });
    } catch (_error) {
      throw new InternalServerErrorException(
        '관리자 초대 메일 전송에 실패했습니다.',
      );
    }

    return {
      ...invitedUser,
      resent,
    };
  }
}
