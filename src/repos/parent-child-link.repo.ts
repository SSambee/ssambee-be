import { PrismaClient } from '../generated/prisma/client.js';
import type { Prisma } from '../generated/prisma/client.js';

export class ParentChildLinkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** 자녀 링크 생성 */
  async create(
    data: Prisma.ParentChildLinkUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.parentChildLink.create({
      data,
    });
  }

  /** 학부모 ID로 자녀 목록 조회 */
  async findByAppParentId(appParentId: string, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return await client.parentChildLink.findMany({
      where: { appParentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** ID로 자녀 링크 조회 */
  async findById(
    id: string,
    options?: { includeParent?: boolean },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.parentChildLink.findUnique({
      where: { id },
      include: {
        parent: options?.includeParent ?? false,
      },
    });
  }

  /** 학부모 ID와 학생 전화번호로 링크 조회 */
  async findByParentIdAndPhoneNumber(
    appParentId: string,
    phoneNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.parentChildLink.findUnique({
      where: {
        appParentId_phoneNumber: {
          appParentId,
          phoneNumber,
        },
      },
    });
  }

  /** 전화번호로 링크 조회 (학부모가 달라도 학생 번호가 같으면 조회 - 보통은 유니크하지 않을 수 있지만, 여기선 특정 학생에 대한 링크들을 찾을 때 사용) */
  async findManyByPhoneNumber(
    phoneNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.parentChildLink.findMany({
      where: { phoneNumber },
    });
  }

  /** 학생 전화번호/이름/학부모 전화번호로 자녀 링크 조회 */
  async findByPhoneNumberAndProfile(
    phoneNumber: string,
    studentName: string,
    parentPhoneNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    return await client.parentChildLink.findFirst({
      where: {
        phoneNumber,
        name: studentName,
        parent: {
          phoneNumber: parentPhoneNumber,
        },
      },
    });
  }
}
